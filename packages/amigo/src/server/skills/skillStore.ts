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

const SKILL_MARKDOWN_FILE = "SKILL.md";

const normalizeRelativePath = (value: string): string => value.replace(/\\/g, "/");

const sortPaths = (values: string[]): string[] =>
  [...values].sort((a, b) => a.localeCompare(b, "en"));

export class SkillStore implements SkillProvider {
  private readonly skillsDir: string;

  constructor(cachePath: string) {
    this.skillsDir = path.join(cachePath, "skills");
  }

  async init(): Promise<void> {
    await mkdir(this.skillsDir, { recursive: true });
  }

  async list(): Promise<SkillSummary[]> {
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

  async get(id: string): Promise<SkillDefinition | null> {
    await this.init();
    return this.readSkillDefinition(id);
  }

  async getBundle(id: string): Promise<SkillBundle | null> {
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

  async upsert(input: SkillUpsertInput): Promise<SkillDefinition> {
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

  async importFromDirectory(sourceDir: string, input?: { id?: string }): Promise<SkillDefinition> {
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

  async remove(id: string): Promise<boolean> {
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

  private async readSkillDefinition(id: string): Promise<SkillDefinition | null> {
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
    const manifest: SkillResourceManifest = {
      scripts: [],
      references: [],
      assets: [],
      agents: [],
      extraFiles: [],
    };

    for (const filePath of allFiles) {
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

  private getSkillDir(id: string): string {
    return path.join(this.skillsDir, id.trim());
  }

  private getSkillMarkdownPath(id: string): string {
    return path.join(this.getSkillDir(id), SKILL_MARKDOWN_FILE);
  }
}

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "skill";
