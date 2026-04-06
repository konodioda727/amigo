import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export type RuleConversationType = "main" | "sub";

const RuleScopeSchema = z.enum(["main", "sub"]);

export const RuleReferenceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  whenToRead: z.string().min(1),
  scopes: z.array(RuleScopeSchema).min(1).default(["main", "sub"]),
});

export type RuleReference = z.infer<typeof RuleReferenceSchema>;
export type RuleDocument = RuleReference & {
  content: string;
};

export interface RuleProvider {
  getSystemPromptAppendix(params: {
    conversationType: RuleConversationType;
    context?: unknown;
  }): string | undefined;
  getPromptReferences(params: {
    conversationType: RuleConversationType;
    context?: unknown;
  }): RuleReference[];
  getRule(id: string): Promise<RuleDocument | null>;
}

const ensurePathWithinRoot = (rootDir: string, relativePath: string): string => {
  const normalizedRelativePath = relativePath.trim().replace(/^(\.\/)+/, "");
  const resolved = path.resolve(rootDir, normalizedRelativePath);
  const relativeToRoot = path.relative(rootDir, resolved);
  if (
    !relativeToRoot ||
    relativeToRoot === "." ||
    (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot))
  ) {
    return resolved;
  }
  throw new Error(`Rule path escapes root directory: ${relativePath}`);
};

const parseFrontmatterBlock = (
  rawContent: string,
): { frontmatter: Record<string, string>; body: string } => {
  const normalized = rawContent.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: {}, body: normalized.trim() };
  }

  const closingMarkerIndex = normalized.indexOf("\n---\n", 4);
  if (closingMarkerIndex === -1) {
    return { frontmatter: {}, body: normalized.trim() };
  }

  const frontmatterSource = normalized.slice(4, closingMarkerIndex).trim();
  const body = normalized.slice(closingMarkerIndex + 5).trim();
  const frontmatter: Record<string, string> = {};
  for (const line of frontmatterSource.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmedLine.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();
    if (key) {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
};

const parseScopes = (rawScope: string | undefined): RuleConversationType[] => {
  const normalizedScopes = (rawScope || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope): scope is RuleConversationType => scope === "main" || scope === "sub");
  return normalizedScopes.length > 0 ? normalizedScopes : ["main", "sub"];
};

const buildRuleReferenceFromFile = (filePath: string): RuleReference => {
  const id = path.basename(filePath, path.extname(filePath)).trim();
  const { frontmatter } = parseFrontmatterBlock(readFileSync(filePath, "utf-8"));
  const title = frontmatter.title?.trim() || id;
  const whenToRead =
    frontmatter.when?.trim() ||
    frontmatter.when_to_read?.trim() ||
    "Read when the current task specifically needs this app-defined detail.";
  return RuleReferenceSchema.parse({
    id,
    title,
    whenToRead,
    scopes: parseScopes(frontmatter.scope),
  });
};

const readMarkdownBody = (filePath: string): string => {
  const { body } = parseFrontmatterBlock(readFileSync(filePath, "utf-8"));
  return body;
};

const readOptionalMarkdownBody = (filePath: string): string | undefined => {
  if (!existsSync(filePath)) {
    return undefined;
  }
  const body = readMarkdownBody(filePath).trim();
  return body || undefined;
};

const MAIN_APPENDIX_PATHS = [
  "shared/critical-rules.md",
  "shared/tool-guide.md",
  "main/identity.md",
  "main/rules.md",
  "main/workflow.md",
] as const;

const SUB_APPENDIX_PATHS = [
  "shared/critical-rules.md",
  "shared/tool-guide.md",
  "sub/identity.md",
  "sub/rules.md",
] as const;

export const createFileSystemRuleProvider = (options: { rootDir: string }): RuleProvider => {
  const rootDir = path.resolve(options.rootDir);
  const docsDir = path.resolve(rootDir, "docs");
  const docs = existsSync(docsDir)
    ? readdirSync(docsDir)
        .filter((entry) => entry.endsWith(".md"))
        .sort((left, right) => left.localeCompare(right))
        .map((entry) => {
          const absolutePath = ensurePathWithinRoot(docsDir, entry);
          const reference = buildRuleReferenceFromFile(absolutePath);
          return { reference, absolutePath };
        })
    : [];
  const ruleMap = new Map(docs.map((doc) => [doc.reference.id, doc] as const));

  const getAppendixPaths = (conversationType: RuleConversationType) =>
    (conversationType === "main" ? MAIN_APPENDIX_PATHS : SUB_APPENDIX_PATHS).map((relativePath) =>
      ensurePathWithinRoot(rootDir, relativePath),
    );

  return {
    getSystemPromptAppendix({ conversationType }) {
      const appendixParts = getAppendixPaths(conversationType)
        .map((absolutePath) => readOptionalMarkdownBody(absolutePath))
        .filter((part): part is string => !!part);
      if (appendixParts.length === 0) {
        return undefined;
      }
      return appendixParts.join("\n\n");
    },
    getPromptReferences({ conversationType }) {
      return docs
        .map((doc) => doc.reference)
        .filter((rule) => rule.scopes.includes(conversationType));
    },
    async getRule(id) {
      const normalizedId = id.trim();
      if (!normalizedId) {
        return null;
      }

      const doc = ruleMap.get(normalizedId);
      if (!doc) {
        return null;
      }

      return {
        ...doc.reference,
        content: readMarkdownBody(doc.absolutePath),
      };
    },
  };
};

export const buildRulesPromptAppendix = (params: {
  provider?: RuleProvider;
  conversationType: RuleConversationType;
  context?: unknown;
}): string | undefined => {
  const references =
    params.provider?.getPromptReferences({
      conversationType: params.conversationType,
      context: params.context,
    }) || [];
  if (references.length === 0) {
    return undefined;
  }

  const lines = [
    "ON-DEMAND RULE DOCS",
    "",
    "The host app exposes the following docs outside the sandbox.",
    "Do NOT use `readFile` for them. When one is relevant, call `readRules` with the id from this table.",
    "",
    "| id | when |",
    "| --- | --- |",
    ...references.map((rule) => `| \`${rule.id}\` | ${rule.whenToRead} |`),
  ];

  return lines.join("\n");
};
