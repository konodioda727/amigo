import type { ToolInterface } from "@amigo-llm/types";
import { z } from "zod";
import type { CreateTaskConfig } from "@/core/server";

const SKILL_MARKDOWN_FILE = "SKILL.md";
const SKILL_STORAGE_ROOT = ".amigo/skills";
export const READ_SKILL_BUNDLE_TOOL_NAME = "readSkillBundle";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const stripWrappingQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

export const SkillResourceManifestSchema = z.object({
  scripts: z.array(z.string()).default([]),
  references: z.array(z.string()).default([]),
  assets: z.array(z.string()).default([]),
  agents: z.array(z.string()).default([]),
  extraFiles: z.array(z.string()).default([]),
});

export const SkillSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  path: z.string().min(1),
  resourceManifest: SkillResourceManifestSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const SkillDefinitionSchema = SkillSummarySchema.extend({
  skillMarkdown: z.string().min(1),
});

export const SkillUpsertSchema = z.object({
  id: z.string().min(1).optional(),
  skillMarkdown: z.string().min(1),
});

export const SkillBundleFileSchema = z.object({
  relativePath: z.string().min(1),
  content: z.instanceof(Buffer),
  mode: z.number().int().nonnegative().default(0o644),
});

export const SkillBundleSchema = z.object({
  skill: SkillDefinitionSchema,
  files: z.array(SkillBundleFileSchema),
});

export type SkillResourceManifest = z.infer<typeof SkillResourceManifestSchema>;
export type SkillSummary = z.infer<typeof SkillSummarySchema>;
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;
export type SkillUpsertInput = z.infer<typeof SkillUpsertSchema>;
export type SkillBundleFile = z.infer<typeof SkillBundleFileSchema>;
export type SkillBundle = z.infer<typeof SkillBundleSchema>;

export type ParsedSkillMarkdown = {
  frontmatter: string;
  body: string;
  name: string;
  description: string;
};

export interface SkillProvider {
  list(): Promise<SkillSummary[]>;
  get(id: string): Promise<SkillDefinition | null>;
  getBundle(id: string): Promise<SkillBundle | null>;
  upsert?(input: SkillUpsertInput): Promise<SkillDefinition>;
  remove?(id: string): Promise<boolean>;
}

const normalizeBundlePath = (value: string): string => value.trim().replace(/^(\.\/)+/, "");
const normalizeSkillLookupKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const addLineNumbers = (content: string, startLine: number) =>
  content
    .split("\n")
    .map((line, index) => `${String(startLine + index).padStart(4, " ")}| ${line}`)
    .join("\n");

const isProbablyBinary = (content: Buffer): boolean => content.includes(0);

type ReadSkillBundleToolParams = {
  skillId: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
};

const resolveSkillSummary = async (
  provider: SkillProvider,
  query: string,
): Promise<SkillSummary | null> => {
  const normalizedQuery = normalizeSkillLookupKey(query);
  if (!normalizedQuery) {
    return null;
  }

  const direct = await provider.get(query);
  if (direct) {
    const { skillMarkdown: _skillMarkdown, ...summary } = direct;
    return summary;
  }

  const skills = await provider.list();
  const exactMatches = skills.filter((skill) => {
    const normalizedId = normalizeSkillLookupKey(skill.id);
    const normalizedName = normalizeSkillLookupKey(skill.name);
    return normalizedId === normalizedQuery || normalizedName === normalizedQuery;
  });
  if (exactMatches.length === 1) {
    return exactMatches[0] || null;
  }

  const suffixMatches = skills.filter((skill) =>
    normalizeSkillLookupKey(skill.id).endsWith(`-${normalizedQuery}`),
  );
  if (suffixMatches.length === 1) {
    return suffixMatches[0] || null;
  }

  const fuzzyMatches = skills.filter((skill) => {
    const normalizedId = normalizeSkillLookupKey(skill.id);
    const normalizedName = normalizeSkillLookupKey(skill.name);
    return normalizedId.includes(normalizedQuery) || normalizedName.includes(normalizedQuery);
  });
  if (fuzzyMatches.length === 1) {
    return fuzzyMatches[0] || null;
  }

  return null;
};

export const createReadSkillBundleTool = (provider: SkillProvider): ToolInterface<string> => ({
  name: READ_SKILL_BUNDLE_TOOL_NAME,
  description:
    "读取已安装 skill bundle 的内容。默认读取 SKILL.md，也可以读取 references/、scripts/、assets/、agents/ 下的文本文件。",
  whenToUse:
    "当任务已选择某个 skill，且你需要查看该 skill 的完整 SKILL.md 或额外参考文件时使用。不要再假设这些文件在 sandbox 中。",
  params: [
    {
      name: "skillId",
      optional: false,
      description: "已安装的 skill ID",
    },
    {
      name: "filePath",
      optional: true,
      description: "skill 内的相对路径，默认 SKILL.md，例如 references/checklist.md",
    },
    {
      name: "startLine",
      optional: true,
      description: "可选：起始行号（从 1 开始）",
    },
    {
      name: "endLine",
      optional: true,
      description: "可选：结束行号（包含）",
    },
  ],
  async invoke({ params }) {
    const { skillId, filePath, startLine, endLine } = params as ReadSkillBundleToolParams;
    const normalizedSkillId = String(skillId || "").trim();
    if (!normalizedSkillId) {
      return {
        message: "skillId 不能为空",
        toolResult: {
          success: false,
          message: "skillId 不能为空",
          skillId: "",
        },
      };
    }

    const resolvedSkill = await resolveSkillSummary(provider, normalizedSkillId);
    if (!resolvedSkill) {
      const skills = await provider.list();
      return {
        message: `未找到 skill: ${normalizedSkillId}`,
        toolResult: {
          success: false,
          message: `未找到 skill: ${normalizedSkillId}`,
          skillId: normalizedSkillId,
          availableSkills: skills.map((skill) => ({
            id: skill.id,
            name: skill.name,
          })),
        },
      };
    }

    const bundle = await provider.getBundle(resolvedSkill.id);
    if (!bundle) {
      return {
        message: `未找到 skill bundle: ${resolvedSkill.id}`,
        toolResult: {
          success: false,
          message: `未找到 skill bundle: ${resolvedSkill.id}`,
          skillId: resolvedSkill.id,
        },
      };
    }

    const targetPath = normalizeBundlePath(filePath || SKILL_MARKDOWN_FILE) || SKILL_MARKDOWN_FILE;
    const bundleFile = bundle.files.find((file) => file.relativePath === targetPath);
    if (!bundleFile) {
      return {
        message: `skill ${normalizedSkillId} 中不存在文件: ${targetPath}`,
        toolResult: {
          success: false,
          message: `skill ${resolvedSkill.id} 中不存在文件: ${targetPath}`,
          skillId: resolvedSkill.id,
          filePath: targetPath,
          availableFiles: bundle.files.map((file) => file.relativePath),
        },
      };
    }

    const availableFiles = bundle.files.map((file) => file.relativePath);
    const skill = bundle.skill;
    const manifest = {
      ...skill.resourceManifest,
      availableFiles,
    };

    if (isProbablyBinary(bundleFile.content)) {
      return {
        message: `已定位二进制文件 ${targetPath}，无法直接按文本展示`,
        toolResult: {
          success: true,
          skillId: resolvedSkill.id,
          skillName: skill.name,
          filePath: targetPath,
          isBinary: true,
          byteLength: bundleFile.content.byteLength,
          resourceManifest: manifest,
          message: `已定位二进制文件 ${targetPath}，无法直接按文本展示`,
        },
      };
    }

    const rawContent = bundleFile.content.toString("utf-8").replace(/\r\n/g, "\n");
    const lines = rawContent.split("\n");
    const safeStartLine = startLine !== undefined ? Math.max(1, Number(startLine) || 1) : 1;
    const requestedEndLine =
      endLine !== undefined
        ? Math.min(lines.length, Number(endLine) || lines.length)
        : lines.length;
    const safeEndLine = Math.max(safeStartLine, requestedEndLine);
    const slicedLines = lines.slice(safeStartLine - 1, safeEndLine);
    const numberedContent = addLineNumbers(slicedLines.join("\n"), safeStartLine);
    const message = `已读取 skill ${resolvedSkill.id} 的 ${targetPath}（第 ${safeStartLine}-${safeEndLine} 行，共 ${lines.length} 行）`;

    return {
      message,
      toolResult: {
        success: true,
        message,
        skillId: resolvedSkill.id,
        skillName: skill.name,
        filePath: targetPath,
        content: numberedContent,
        totalLines: lines.length,
        startLine: safeStartLine,
        endLine: safeEndLine,
        resourceManifest: manifest,
      },
    };
  },
});

export const splitSkillMarkdown = (
  skillMarkdown: string,
): { frontmatter: string; body: string } => {
  const normalized = skillMarkdown.replace(/\r\n/g, "\n").trim();
  if (!normalized.startsWith("---\n")) {
    throw new Error("SKILL.md 缺少 YAML frontmatter，文件必须以 --- 开头");
  }

  const closingMarkerIndex = normalized.indexOf("\n---\n", 4);
  if (closingMarkerIndex < 0) {
    throw new Error("SKILL.md frontmatter 缺少结束分隔符 ---");
  }

  const frontmatter = normalized.slice(4, closingMarkerIndex).trim();
  const body = normalized.slice(closingMarkerIndex + "\n---\n".length).trim();

  if (!body) {
    throw new Error("SKILL.md 正文不能为空");
  }

  return { frontmatter, body };
};

export const extractRequiredFrontmatterField = (
  frontmatter: string,
  fieldName: "name" | "description",
): string => {
  const pattern = new RegExp(`^${fieldName}:\\s*(.+)$`, "m");
  const match = frontmatter.match(pattern);
  const value = stripWrappingQuotes(match?.[1] || "");
  if (!value) {
    throw new Error(`SKILL.md frontmatter 缺少必填字段 ${fieldName}`);
  }
  return value;
};

export const parseSkillMarkdown = (skillMarkdown: string): ParsedSkillMarkdown => {
  const { frontmatter, body } = splitSkillMarkdown(skillMarkdown);
  return {
    frontmatter,
    body,
    name: extractRequiredFrontmatterField(frontmatter, "name"),
    description: extractRequiredFrontmatterField(frontmatter, "description"),
  };
};

export class SkillRuntime {
  constructor(private readonly provider: SkillProvider) {}

  async resolveCreateTaskConfig(context: unknown): Promise<CreateTaskConfig | undefined> {
    const installedSkills = await this.provider.list();
    const skillIds = this.extractSkillIds(context);
    const skills = (
      await Promise.all(skillIds.map((skillId) => this.provider.get(skillId)))
    ).filter((skill): skill is SkillDefinition => !!skill);

    const mergedContext: Record<string, unknown> = isPlainObject(context) ? { ...context } : {};
    if (skillIds.length > 0) {
      mergedContext.skillIds = skillIds;
      mergedContext.skillBundles = skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        skillPath: `${SKILL_STORAGE_ROOT}/${skill.id}/${SKILL_MARKDOWN_FILE}`,
        ...skill.resourceManifest,
      }));
    }

    const promptSections = [
      this.buildInstalledSkillsIndexPrompt(installedSkills),
      skills.length > 0 ? this.buildActiveSkillPrompt(skills) : "",
    ].filter(Boolean);

    if (promptSections.length === 0) {
      if (isPlainObject(context)) {
        return { context };
      }
      return undefined;
    }

    const config: CreateTaskConfig = {
      ...(Object.keys(mergedContext).length > 0 ? { context: mergedContext } : {}),
      customPrompt: promptSections.join("\n\n"),
    };

    return config;
  }

  async onConversationCreate(payload: { taskId: string; context?: unknown }): Promise<void> {
    void payload;
  }

  private buildInstalledSkillsIndexPrompt(skills: SkillSummary[]): string {
    if (skills.length === 0) {
      return "";
    }

    const lines = [
      "系统中当前已安装以下 skills。",
      "你应当默认知道这些 skill 的存在、name、id 和 description。",
      "如果用户提到某个 skill，可以按 name 或 id 理解它；需要详细说明或文件内容时，再调用 `readSkillBundle` 深入读取。",
      "",
      ...skills.map((skill) => `- ${skill.name} (id: ${skill.id}): ${skill.description}`),
    ];

    return lines.join("\n");
  }

  private buildActiveSkillPrompt(skills: SkillDefinition[]): string {
    const lines = [
      "以下是当前任务已激活的 Claude 风格 skills。",
      "这些 skill 已被明确选中，下面直接内联它们的 `SKILL.md` 内容作为当前任务约束。",
      `把这些 skill 当作当前任务的可复用工作流说明来遵循。若要继续查看某个 skill 的额外文件，请使用 \`${READ_SKILL_BUNDLE_TOOL_NAME}\`。`,
      "",
      ...skills.flatMap((skill) => {
        const resourceHints = [
          skill.resourceManifest.references.length > 0
            ? `references: ${skill.resourceManifest.references.join(", ")}`
            : undefined,
          skill.resourceManifest.scripts.length > 0
            ? `scripts: ${skill.resourceManifest.scripts.join(", ")}`
            : undefined,
          skill.resourceManifest.assets.length > 0
            ? `assets: ${skill.resourceManifest.assets.join(", ")}`
            : undefined,
          skill.resourceManifest.agents.length > 0
            ? `agents: ${skill.resourceManifest.agents.join(", ")}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" | ");

        return [
          `- ${skill.name} (${skill.id}): ${skill.description}`,
          `  - server path: ${SKILL_STORAGE_ROOT}/${skill.id}/${SKILL_MARKDOWN_FILE}`,
          ...(resourceHints ? [`  - ${resourceHints}`] : []),
          "  - SKILL.md:",
          ...skill.skillMarkdown.split("\n").map((line) => `    ${line}`),
        ];
      }),
    ];

    return lines.join("\n");
  }

  private extractSkillIds(context: unknown): string[] {
    if (!isPlainObject(context)) {
      return [];
    }

    const rawSkillIds = context.skillIds;
    if (Array.isArray(rawSkillIds)) {
      return Array.from(
        new Set(rawSkillIds.map((value) => String(value || "").trim()).filter(Boolean)),
      );
    }

    if (typeof context.skillId === "string" && context.skillId.trim()) {
      return [context.skillId.trim()];
    }

    return [];
  }
}
