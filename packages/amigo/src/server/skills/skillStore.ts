import type { Dirent } from "node:fs";
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseSkillMarkdown,
  type SkillBundle,
  type SkillBundleFile,
  SkillBundleSchema,
  type SkillDefinition,
  SkillDefinitionSchema,
  type SkillProvider,
  type SkillResourceManifest,
  SkillResourceManifestSchema,
  type SkillSummary,
  SkillSummarySchema,
  type SkillUpsertInput,
} from "@amigo-llm/backend";
import { and, desc, eq } from "drizzle-orm";
import {
  ensureMysqlSchemaUpToDate,
  formatMysqlDateTime,
  getDrizzleDb,
  isMysqlConfigured,
  parseJsonColumn,
  skillsTable,
} from "../db";

const SKILL_MARKDOWN_FILE = "SKILL.md";

const normalizeRelativePath = (value: string): string => value.replace(/\\/g, "/");

const sortPaths = (values: string[]): string[] =>
  [...values].sort((a, b) => a.localeCompare(b, "en"));

type SkillRow = typeof skillsTable.$inferSelect;

const parseDateTime = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const raw = String(value || "").trim();
  if (!raw) {
    return new Date(0).toISOString();
  }
  if (raw.includes("T")) {
    return new Date(raw).toISOString();
  }
  return new Date(`${raw.replace(" ", "T")}Z`).toISOString();
};

const buildResourceManifest = (relativePaths: string[]): SkillResourceManifest => {
  const manifest: SkillResourceManifest = {
    scripts: [],
    references: [],
    assets: [],
    agents: [],
    extraFiles: [],
  };

  for (const filePath of relativePaths) {
    if (filePath === SKILL_MARKDOWN_FILE) {
      continue;
    }
    if (filePath.startsWith("scripts/")) {
      manifest.scripts.push(filePath);
      continue;
    }
    if (filePath.startsWith("references/")) {
      manifest.references.push(filePath);
      continue;
    }
    if (filePath.startsWith("assets/")) {
      manifest.assets.push(filePath);
      continue;
    }
    if (filePath.startsWith("agents/")) {
      manifest.agents.push(filePath);
      continue;
    }
    manifest.extraFiles.push(filePath);
  }

  return SkillResourceManifestSchema.parse({
    scripts: sortPaths(manifest.scripts),
    references: sortPaths(manifest.references),
    assets: sortPaths(manifest.assets),
    agents: sortPaths(manifest.agents),
    extraFiles: sortPaths(manifest.extraFiles),
  });
};

const mapSkillRow = (row: SkillRow): SkillDefinition => {
  const resourceManifest = SkillResourceManifestSchema.parse(
    parseJsonColumn<SkillResourceManifest>(row.resourceManifestJson, {
      scripts: [],
      references: [],
      assets: [],
      agents: [],
      extraFiles: [],
    }),
  );

  return SkillDefinitionSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    path: row.path,
    resourceManifest,
    skillMarkdown: row.skillMarkdown,
    createdAt: parseDateTime(row.createdAt),
    updatedAt: parseDateTime(row.updatedAt),
  });
};

export class SkillStore implements SkillProvider {
  private readonly skillsDir: string;

  constructor(cachePath: string) {
    this.skillsDir = path.join(cachePath, "skills");
  }

  async init(): Promise<void> {
    if (isMysqlConfigured()) {
      await ensureMysqlSchemaUpToDate();
    }

    await mkdir(this.skillsDir, { recursive: true });
  }

  async list(userId?: string): Promise<SkillSummary[]> {
    if (isMysqlConfigured()) {
      await this.init();
      const rows = await this.listSkillRows(userId);
      const skills = await Promise.all(rows.map((row) => this.hydrateDatabaseSkill(row)));
      return skills
        .map(({ skillMarkdown: _skillMarkdown, ...summary }) => summary)
        .map((summary) => SkillSummarySchema.parse(summary));
    }

    await this.init();
    const entries = await readdir(this.skillsDir, { withFileTypes: true });
    const skills = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.readSummary(entry.name))
        .filter(Boolean),
    );
    return skills
      .filter((skill): skill is SkillSummary => !!skill)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string, userId?: string): Promise<SkillDefinition | null> {
    if (isMysqlConfigured()) {
      await this.init();
      const row = await this.readSkillRow(id, userId);
      return row ? this.hydrateDatabaseSkill(row) : null;
    }

    await this.init();
    return this.readSkillDefinition(id);
  }

  async getBundle(id: string, userId?: string): Promise<SkillBundle | null> {
    if (isMysqlConfigured()) {
      await this.init();
      const skill = await this.get(id, userId);
      if (!skill) {
        return null;
      }
      const files = await this.collectSkillFiles(this.resolveSkillDir(id, skill.path));
      return SkillBundleSchema.parse({
        skill,
        files,
      });
    }

    const skill = await this.get(id);
    if (!skill) {
      return null;
    }

    const files = await this.collectSkillFiles(this.getSkillDir(id));
    return SkillBundleSchema.parse({
      skill,
      files,
    });
  }

  async upsert(input: SkillUpsertInput, userId?: string): Promise<SkillDefinition> {
    if (isMysqlConfigured()) {
      await this.init();
      if (!userId?.trim()) {
        throw new Error("skill 缺少 userId，无法确定归属用户。");
      }
      const parsed = parseSkillMarkdown(input.skillMarkdown);
      const normalizedId = (input.id?.trim() || slugify(parsed.name)).trim();
      const existing = await this.get(normalizedId, userId);
      const nowIso = new Date().toISOString();
      const skillDir = this.getSkillDir(normalizedId);
      const normalizedMarkdown = `${input.skillMarkdown.trim()}\n`;
      await mkdir(skillDir, { recursive: true });
      await writeFile(this.getSkillMarkdownPath(normalizedId), normalizedMarkdown, "utf-8");
      const manifest = await this.readResourceManifest(skillDir);
      const now = formatMysqlDateTime(new Date(nowIso));

      await getDrizzleDb()
        .insert(skillsTable)
        .values({
          id: normalizedId,
          userId: userId.trim(),
          name: parsed.name,
          description: parsed.description,
          skillMarkdown: normalizedMarkdown.trim(),
          resourceManifestJson: manifest,
          path: skillDir,
          createdAt: existing?.createdAt ? formatMysqlDateTime(new Date(existing.createdAt)) : now,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            name: parsed.name,
            description: parsed.description,
            skillMarkdown: normalizedMarkdown.trim(),
            resourceManifestJson: manifest,
            path: skillDir,
            updatedAt: now,
          },
        });

      const skill = await this.get(normalizedId, userId);
      if (!skill) {
        throw new Error(`skill 保存失败: ${normalizedId}`);
      }
      return skill;
    }

    await this.init();

    const parsed = parseSkillMarkdown(input.skillMarkdown);
    const normalizedId = (input.id?.trim() || slugify(parsed.name)).trim();
    const skillDir = this.getSkillDir(normalizedId);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      this.getSkillMarkdownPath(normalizedId),
      `${input.skillMarkdown.trim()}\n`,
      "utf-8",
    );

    const skill = await this.readSkillDefinition(normalizedId);
    if (!skill) {
      throw new Error(`skill 保存失败: ${normalizedId}`);
    }
    return skill;
  }

  async importFromDirectory(
    sourceDir: string,
    input?: { id?: string; userId?: string },
  ): Promise<SkillDefinition> {
    if (isMysqlConfigured()) {
      await this.init();
      if (!input?.userId?.trim()) {
        throw new Error("skill 缺少 userId，无法确定归属用户。");
      }

      const sourceSkillMarkdownPath = path.join(sourceDir, SKILL_MARKDOWN_FILE);
      const skillMarkdown = await readFile(sourceSkillMarkdownPath, "utf-8");
      const parsed = parseSkillMarkdown(skillMarkdown);
      const normalizedId = (input?.id?.trim() || slugify(parsed.name)).trim();
      const targetDir = this.getSkillDir(normalizedId);
      await rm(targetDir, { recursive: true, force: true });
      await mkdir(targetDir, { recursive: true });
      await this.copyDirectory(sourceDir, targetDir);
      const manifest = await this.readResourceManifest(targetDir);
      const nowIso = new Date().toISOString();
      const existing = await this.get(normalizedId, input.userId);
      const now = formatMysqlDateTime(new Date(nowIso));

      await getDrizzleDb()
        .insert(skillsTable)
        .values({
          id: normalizedId,
          userId: input.userId.trim(),
          name: parsed.name,
          description: parsed.description,
          skillMarkdown: skillMarkdown.trim(),
          resourceManifestJson: manifest,
          path: targetDir,
          createdAt: existing?.createdAt ? formatMysqlDateTime(new Date(existing.createdAt)) : now,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            userId: input.userId.trim(),
            name: parsed.name,
            description: parsed.description,
            skillMarkdown: skillMarkdown.trim(),
            resourceManifestJson: manifest,
            path: targetDir,
            updatedAt: now,
          },
        });

      const skill = await this.get(normalizedId, input.userId);
      if (!skill) {
        throw new Error(`skill 导入失败: ${normalizedId}`);
      }
      return skill;
    }

    await this.init();

    const sourceSkillMarkdownPath = path.join(sourceDir, SKILL_MARKDOWN_FILE);
    const skillMarkdown = await readFile(sourceSkillMarkdownPath, "utf-8");
    const parsed = parseSkillMarkdown(skillMarkdown);
    const normalizedId = (input?.id?.trim() || slugify(parsed.name)).trim();
    const targetDir = this.getSkillDir(normalizedId);

    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });
    await this.copyDirectory(sourceDir, targetDir);

    const skill = await this.readSkillDefinition(normalizedId);
    if (!skill) {
      throw new Error(`skill 导入失败: ${normalizedId}`);
    }
    return skill;
  }

  async remove(id: string, userId?: string): Promise<boolean> {
    if (isMysqlConfigured()) {
      await this.init();
      await rm(this.getSkillDir(id.trim()), { recursive: true, force: true });
      const existing = await this.readSkillRow(id.trim(), userId);
      if (!existing) {
        return false;
      }
      await getDrizzleDb()
        .delete(skillsTable)
        .where(
          userId?.trim()
            ? and(eq(skillsTable.id, id.trim()), eq(skillsTable.userId, userId.trim()))
            : eq(skillsTable.id, id.trim()),
        );
      return true;
    }

    await this.init();
    try {
      await rm(this.getSkillDir(id.trim()), { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  private async readSummary(id: string): Promise<SkillSummary | null> {
    const definition = await this.readSkillDefinition(id);
    if (!definition) {
      return null;
    }
    const { skillMarkdown: _skillMarkdown, ...summary } = definition;
    return SkillSummarySchema.parse(summary);
  }

  private async readSkillDefinition(id: string, userId?: string): Promise<SkillDefinition | null> {
    if (isMysqlConfigured()) {
      const row = await this.readSkillRow(id.trim(), userId);
      return row ? this.hydrateDatabaseSkill(row) : null;
    }

    const skillDir = this.getSkillDir(id);
    try {
      const skillMarkdown = await readFile(this.getSkillMarkdownPath(id), "utf-8");
      const parsed = parseSkillMarkdown(skillMarkdown);
      const resourceManifest = await this.readResourceManifest(skillDir);
      const skillFileStats = await stat(this.getSkillMarkdownPath(id));

      return SkillDefinitionSchema.parse({
        id,
        name: parsed.name,
        description: parsed.description,
        path: skillDir,
        resourceManifest,
        skillMarkdown,
        createdAt: skillFileStats.birthtime.toISOString(),
        updatedAt: skillFileStats.mtime.toISOString(),
      });
    } catch {
      return null;
    }
  }

  private async readResourceManifest(skillDir: string): Promise<SkillResourceManifest> {
    const allFiles = await this.collectRelativeFilePaths(skillDir);
    return buildResourceManifest(allFiles);
  }

  private async collectRelativeFilePaths(directoryPath: string, prefix = ""): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const collected: string[] = [];
    for (const entry of entries) {
      if (entry.name === ".DS_Store") {
        continue;
      }

      const relativePath = prefix
        ? normalizeRelativePath(path.join(prefix, entry.name))
        : entry.name;
      const absolutePath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        collected.push(...(await this.collectRelativeFilePaths(absolutePath, relativePath)));
        continue;
      }

      if (entry.isFile()) {
        collected.push(relativePath);
      }
    }

    return sortPaths(collected);
  }

  private async collectSkillFiles(skillDir: string, prefix = ""): Promise<SkillBundleFile[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(skillDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const files: SkillBundleFile[] = [];
    for (const entry of entries) {
      if (entry.name === ".DS_Store") {
        continue;
      }

      const relativePath = prefix
        ? normalizeRelativePath(path.join(prefix, entry.name))
        : entry.name;
      const absolutePath = path.join(skillDir, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await this.collectSkillFiles(absolutePath, relativePath)));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const [content, fileStats] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
      files.push({
        relativePath,
        content,
        mode: fileStats.mode & 0o777,
      });
    }

    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"));
  }

  private async copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store") {
        continue;
      }

      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        await mkdir(targetPath, { recursive: true });
        await this.copyDirectory(sourcePath, targetPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const [content, fileStats] = await Promise.all([readFile(sourcePath), stat(sourcePath)]);
      await writeFile(targetPath, content);
      await chmod(targetPath, fileStats.mode & 0o777);
    }
  }

  private resolveSkillDir(id: string, storedPath?: string): string {
    const normalizedId = id.trim();
    const fallback = this.getSkillDir(normalizedId);
    const normalizedStoredPath = (storedPath || "").trim();
    if (!normalizedStoredPath || normalizedStoredPath.startsWith("db://")) {
      return fallback;
    }
    return normalizedStoredPath;
  }

  private async hydrateDatabaseSkill(row: SkillRow): Promise<SkillDefinition> {
    const fallback = mapSkillRow(row);
    const skillDir = this.resolveSkillDir(row.id, row.path);

    try {
      const skillMarkdown = await readFile(path.join(skillDir, SKILL_MARKDOWN_FILE), "utf-8");
      const parsed = parseSkillMarkdown(skillMarkdown);
      const resourceManifest = await this.readResourceManifest(skillDir);

      return SkillDefinitionSchema.parse({
        ...fallback,
        name: parsed.name,
        description: parsed.description,
        path: skillDir,
        resourceManifest,
        skillMarkdown,
      });
    } catch {
      return SkillDefinitionSchema.parse({
        ...fallback,
        path: skillDir,
      });
    }
  }

  private getSkillDir(id: string): string {
    return path.join(this.skillsDir, id.trim());
  }

  private getSkillMarkdownPath(id: string): string {
    return path.join(this.getSkillDir(id), SKILL_MARKDOWN_FILE);
  }

  private async listSkillRows(userId?: string): Promise<SkillRow[]> {
    const db = getDrizzleDb();
    return userId?.trim()
      ? db
          .select()
          .from(skillsTable)
          .where(eq(skillsTable.userId, userId.trim()))
          .orderBy(desc(skillsTable.updatedAt))
      : db.select().from(skillsTable).orderBy(desc(skillsTable.updatedAt));
  }

  private async readSkillRow(id: string, userId?: string): Promise<SkillRow | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(skillsTable)
      .where(
        userId?.trim()
          ? and(eq(skillsTable.id, id.trim()), eq(skillsTable.userId, userId.trim()))
          : eq(skillsTable.id, id.trim()),
      )
      .limit(1);
    return rows[0] || null;
  }
}

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "skill";
