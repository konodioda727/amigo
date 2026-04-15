import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  documentsTable,
  ensureMysqlSchemaUpToDate,
  formatMysqlDateTime,
  getDrizzleDb,
  parseJsonColumn,
} from "../db";

const REPO_KNOWLEDGE_SCOPE = "repo_knowledge";
const REPO_KNOWLEDGE_FORMAT = "repo_knowledge_bundle";
const INDEX_FILE_PATH = "INDEX.md";

export interface RepoKnowledgeFile {
  path: string;
  content: string;
}

export interface RepoKnowledgeSection {
  id: string;
  title: string;
  summary: string;
  filePath: string;
  evidenceFiles: string[];
  updatedAt: string;
  lastVerifiedCommit: string | null;
}

export interface RepoKnowledgeManifest {
  title: string;
  repoUrl: string;
  branch: string;
  defaultBranch: string | null;
  version: number;
  updatedAt: string;
  sections: RepoKnowledgeSection[];
  files: Array<{
    path: string;
    kind: "index" | "section" | "evidence";
    title?: string;
    summary?: string;
  }>;
}

export interface RepoKnowledgeBundle {
  manifest: RepoKnowledgeManifest;
  files: Record<string, string>;
}

type DocumentRow = typeof documentsTable.$inferSelect;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizePath = (value: string): string => value.replace(/\\/g, "/").replace(/^\.\/+/, "");

const normalizeSectionId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createRepoKnowledgeDocKey = (repoUrl: string, branch: string): string =>
  `${Bun.hash(`${repoUrl.trim().toLowerCase()}#${branch.trim().toLowerCase()}`).toString(16)}:${branch.trim().toLowerCase()}`;

const inferRepoName = (repoUrl: string): string => {
  const normalized = repoUrl.trim().replace(/\/+$/, "");
  const lastSegment = normalized.split(/[:/]/).filter(Boolean).at(-1) || "repo";
  return lastSegment.replace(/\.git$/i, "") || "repo";
};

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

const sortStrings = (values: string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "en"),
  );

const buildIndexContent = (manifest: RepoKnowledgeManifest): string => {
  const lines = [
    `# ${manifest.title}`,
    "",
    `- repoUrl: ${manifest.repoUrl}`,
    `- branch: ${manifest.branch}`,
    `- defaultBranch: ${manifest.defaultBranch || "unknown"}`,
    `- version: ${manifest.version}`,
    `- updatedAt: ${manifest.updatedAt}`,
    "",
    "先读这个索引，再按需读取具体 section 或 evidence 文件。",
    "",
    "## Sections",
  ];

  if (manifest.sections.length === 0) {
    lines.push(
      "- 暂无 section。先创建 overview，再逐步补充 package-map / entrypoints / architecture / run-and-build / conventions / gotchas。",
    );
  } else {
    for (const section of manifest.sections) {
      lines.push(`- ${section.id}: ${section.title}`);
      lines.push(`  - file: ${section.filePath}`);
      lines.push(`  - summary: ${section.summary}`);
      lines.push(
        `  - evidence: ${section.evidenceFiles.length > 0 ? section.evidenceFiles.join(", ") : "none"}`,
      );
      lines.push(`  - lastVerifiedCommit: ${section.lastVerifiedCommit || "unknown"}`);
      lines.push(`  - updatedAt: ${section.updatedAt}`);
    }
  }

  return `${lines.join("\n")}\n`;
};

const buildFileEntries = (manifest: RepoKnowledgeManifest): RepoKnowledgeManifest["files"] => {
  const files: RepoKnowledgeManifest["files"] = [
    {
      path: INDEX_FILE_PATH,
      kind: "index",
      title: manifest.title,
      summary: "仓库知识索引和 section 导航",
    },
  ];

  for (const section of manifest.sections) {
    files.push({
      path: section.filePath,
      kind: "section",
      title: section.title,
      summary: section.summary,
    });
    for (const evidenceFile of section.evidenceFiles) {
      files.push({
        path: evidenceFile,
        kind: "evidence",
        title: `${section.title} evidence`,
      });
    }
  }

  return files;
};

const parseBundle = (row: DocumentRow): RepoKnowledgeBundle | null => {
  const contentJson = parseJsonColumn<Record<string, unknown> | null>(row.contentJson, null);
  if (
    !isPlainObject(contentJson) ||
    !isPlainObject(contentJson.manifest) ||
    !isPlainObject(contentJson.files)
  ) {
    return null;
  }

  const manifestRow = contentJson.manifest;
  const filesRow = contentJson.files;
  const sections = Array.isArray(manifestRow.sections)
    ? manifestRow.sections
        .map((item) => {
          if (!isPlainObject(item)) {
            return null;
          }
          const evidenceFiles = Array.isArray(item.evidenceFiles)
            ? sortStrings(
                item.evidenceFiles.filter((value): value is string => typeof value === "string"),
              )
            : [];
          return {
            id: typeof item.id === "string" ? item.id : "",
            title: typeof item.title === "string" ? item.title : "",
            summary: typeof item.summary === "string" ? item.summary : "",
            filePath: typeof item.filePath === "string" ? item.filePath : "",
            evidenceFiles,
            updatedAt: parseDateTime(item.updatedAt),
            lastVerifiedCommit:
              typeof item.lastVerifiedCommit === "string" && item.lastVerifiedCommit.trim()
                ? item.lastVerifiedCommit.trim()
                : null,
          } satisfies RepoKnowledgeSection;
        })
        .filter((item): item is RepoKnowledgeSection =>
          Boolean(item?.id && item.title && item.filePath),
        )
    : [];

  const files = Object.fromEntries(
    Object.entries(filesRow)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      )
      .map(([filePath, content]) => [normalizePath(filePath), content]),
  );

  const manifest: RepoKnowledgeManifest = {
    title:
      typeof manifestRow.title === "string" && manifestRow.title.trim()
        ? manifestRow.title.trim()
        : row.title,
    repoUrl: typeof manifestRow.repoUrl === "string" ? manifestRow.repoUrl : "",
    branch: typeof manifestRow.branch === "string" ? manifestRow.branch : "",
    defaultBranch:
      typeof manifestRow.defaultBranch === "string" && manifestRow.defaultBranch.trim()
        ? manifestRow.defaultBranch.trim()
        : null,
    version:
      typeof manifestRow.version === "number" && Number.isFinite(manifestRow.version)
        ? Math.max(1, Math.trunc(manifestRow.version))
        : Math.max(1, row.version),
    updatedAt: parseDateTime(manifestRow.updatedAt || row.updatedAt),
    sections,
    files: [],
  };
  manifest.files = buildFileEntries(manifest);
  return { manifest, files };
};

const createEmptyBundle = (input: {
  repoUrl: string;
  branch: string;
  defaultBranch?: string;
}): RepoKnowledgeBundle => {
  const manifest: RepoKnowledgeManifest = {
    title: `Repository Knowledge: ${inferRepoName(input.repoUrl)}@${input.branch}`,
    repoUrl: input.repoUrl,
    branch: input.branch,
    defaultBranch: input.defaultBranch?.trim() || null,
    version: 1,
    updatedAt: new Date().toISOString(),
    sections: [],
    files: [],
  };
  const files: Record<string, string> = {
    [INDEX_FILE_PATH]: "",
  };
  manifest.files = buildFileEntries(manifest);
  files[INDEX_FILE_PATH] = buildIndexContent(manifest);
  return { manifest, files };
};

const cloneBundle = (bundle: RepoKnowledgeBundle): RepoKnowledgeBundle =>
  JSON.parse(JSON.stringify(bundle)) as RepoKnowledgeBundle;

const serializeBundle = (bundle: RepoKnowledgeBundle) => ({
  manifest: {
    ...bundle.manifest,
    files: buildFileEntries(bundle.manifest),
  },
  files: bundle.files,
});

export class RepoKnowledgeStore {
  async get(input: {
    userId: string;
    repoUrl: string;
    branch: string;
    defaultBranch?: string;
  }): Promise<{ bundle: RepoKnowledgeBundle | null; resolvedBranch: string | null }> {
    await ensureMysqlSchemaUpToDate();
    const db = getDrizzleDb();
    const requestedBranch = input.branch.trim();
    const fallbackBranches = [requestedBranch, input.defaultBranch?.trim() || ""].filter(
      (branch, index, values) => branch && values.indexOf(branch) === index,
    );

    for (const branch of fallbackBranches) {
      const row = await db.query.documentsTable.findFirst({
        where: and(
          eq(documentsTable.userId, input.userId.trim()),
          eq(documentsTable.docScope, REPO_KNOWLEDGE_SCOPE),
          eq(documentsTable.docKey, createRepoKnowledgeDocKey(input.repoUrl, branch)),
        ),
      });
      if (!row) {
        continue;
      }
      const bundle = parseBundle(row);
      if (bundle) {
        return { bundle, resolvedBranch: branch };
      }
    }

    return { bundle: null, resolvedBranch: null };
  }

  async upsert(input: {
    userId: string;
    ownerConversationId?: string;
    repoUrl: string;
    branch: string;
    defaultBranch?: string;
    sectionId: string;
    title: string;
    summary: string;
    content: string;
    evidenceFiles?: RepoKnowledgeFile[];
    lastVerifiedCommit?: string;
  }): Promise<RepoKnowledgeBundle> {
    await ensureMysqlSchemaUpToDate();
    const db = getDrizzleDb();
    const existing = await this.get({
      userId: input.userId,
      repoUrl: input.repoUrl,
      branch: input.branch,
      defaultBranch: input.defaultBranch,
    });
    const bundle = existing.bundle
      ? (() => {
          const nextBundle = cloneBundle(existing.bundle);
          nextBundle.manifest.repoUrl = input.repoUrl;
          nextBundle.manifest.branch = input.branch.trim();
          nextBundle.manifest.defaultBranch =
            input.defaultBranch?.trim() || nextBundle.manifest.defaultBranch;
          nextBundle.manifest.title = `Repository Knowledge: ${inferRepoName(input.repoUrl)}@${input.branch.trim()}`;
          return nextBundle;
        })()
      : createEmptyBundle({
          repoUrl: input.repoUrl,
          branch: input.branch,
          defaultBranch: input.defaultBranch,
        });

    const sectionId = normalizeSectionId(input.sectionId);
    if (!sectionId) {
      throw new Error("sectionId 不能为空");
    }
    const nowIso = new Date().toISOString();
    const now = formatMysqlDateTime(new Date(nowIso));
    const sectionFilePath = `sections/${sectionId}.md`;
    const normalizedEvidenceFiles = (input.evidenceFiles || []).map((file) => {
      const requestedPath = normalizePath(file.path);
      const finalPath = requestedPath.startsWith("evidence/")
        ? requestedPath
        : `evidence/${sectionId}/${requestedPath.replace(/^\/+/, "")}`;
      return {
        path: finalPath,
        content: `${file.content.trim()}\n`,
      };
    });

    bundle.files[sectionFilePath] = `${input.content.trim()}\n`;
    for (const evidenceFile of normalizedEvidenceFiles) {
      bundle.files[evidenceFile.path] = evidenceFile.content;
    }

    const previousSection = bundle.manifest.sections.find((section) => section.id === sectionId);
    const nextSection: RepoKnowledgeSection = {
      id: sectionId,
      title: input.title.trim(),
      summary: input.summary.trim(),
      filePath: sectionFilePath,
      evidenceFiles:
        normalizedEvidenceFiles.length > 0
          ? sortStrings(normalizedEvidenceFiles.map((file) => file.path))
          : previousSection?.evidenceFiles || [],
      updatedAt: nowIso,
      lastVerifiedCommit: input.lastVerifiedCommit?.trim() || null,
    };
    const existingIndex = bundle.manifest.sections.findIndex((section) => section.id === sectionId);
    if (existingIndex >= 0) {
      bundle.manifest.sections[existingIndex] = nextSection;
    } else {
      bundle.manifest.sections.push(nextSection);
    }
    bundle.manifest.sections.sort((a, b) => a.id.localeCompare(b.id, "en"));
    bundle.manifest.updatedAt = nowIso;
    bundle.manifest.defaultBranch = input.defaultBranch?.trim() || bundle.manifest.defaultBranch;
    bundle.manifest.version = Math.max(1, bundle.manifest.version) + 1;
    bundle.manifest.files = buildFileEntries(bundle.manifest);
    bundle.files[INDEX_FILE_PATH] = buildIndexContent(bundle.manifest);

    await db
      .insert(documentsTable)
      .values({
        id: randomUUID(),
        ownerConversationId: input.ownerConversationId?.trim() || null,
        userId: input.userId.trim(),
        docScope: REPO_KNOWLEDGE_SCOPE,
        docKey: createRepoKnowledgeDocKey(input.repoUrl, input.branch),
        format: REPO_KNOWLEDGE_FORMAT,
        title: bundle.manifest.title,
        contentText: bundle.files[INDEX_FILE_PATH] || "",
        contentJson: serializeBundle(bundle),
        version: bundle.manifest.version,
        createdAt: now,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          ownerConversationId: input.ownerConversationId?.trim() || null,
          format: REPO_KNOWLEDGE_FORMAT,
          title: bundle.manifest.title,
          contentText: bundle.files[INDEX_FILE_PATH] || "",
          contentJson: serializeBundle(bundle),
          version: bundle.manifest.version,
          updatedAt: now,
        },
      });

    return bundle;
  }
}

export const repoKnowledgeStore = new RepoKnowledgeStore();
