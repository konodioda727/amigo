import { defineTool, parseGithubRepoReference } from "@amigo-llm/backend";
import { repoKnowledgeStore } from "../repoKnowledge/store";

const INDEX_FILE_PATH = "INDEX.md";
const SANDBOX_GIT_STATE_COMMAND = `
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'origin=%s\\n' "$(git remote get-url origin 2>/dev/null || true)"
  printf 'branch=%s\\n' "$(git branch --show-current 2>/dev/null || true)"
  printf 'defaultBranch=%s\\n' "$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@' || true)"
  printf 'commitSha=%s\\n' "$(git rev-parse HEAD 2>/dev/null || true)"
fi
`.trim();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

type RepoContext = {
  userId: string;
  repoUrl: string;
  branch: string;
  defaultBranch: string | null;
  commitSha: string | null;
};

type SandboxCommandRunner = {
  runCommand: (cmd: string, signal?: AbortSignal) => Promise<string | undefined>;
};

const normalizeSectionId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizePath = (value: string): string => value.replace(/\\/g, "/").replace(/^\.\/+/, "");

const normalizeRepoUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const githubRepo = parseGithubRepoReference(trimmed);
  if (githubRepo) {
    return githubRepo.canonicalHttpsUrl;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
};

const addLineNumbers = (content: string, startLine: number) =>
  content
    .split("\n")
    .map((line, index) => `${String(startLine + index).padStart(4, " ")}| ${line}`)
    .join("\n");

const sliceContentByLines = (content: string, startLine?: unknown, endLine?: unknown) => {
  const lines = content.split("\n");
  const normalizedStart =
    typeof startLine === "number" && Number.isFinite(startLine)
      ? Math.max(1, Math.trunc(startLine))
      : 1;
  const normalizedEnd =
    typeof endLine === "number" && Number.isFinite(endLine)
      ? Math.max(normalizedStart, Math.trunc(endLine))
      : lines.length;
  const sliced = lines.slice(normalizedStart - 1, normalizedEnd);
  return {
    content: addLineNumbers(sliced.join("\n"), normalizedStart),
    startLine: normalizedStart,
    endLine: normalizedStart + Math.max(0, sliced.length - 1),
  };
};

const toOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
};

const resolveBranchName = (
  branch: string | null,
  defaultBranch: string | null,
  commitSha: string | null,
) => branch || defaultBranch || (commitSha ? `detached-${commitSha.slice(0, 12)}` : "");

const extractRepoContext = (context: unknown): RepoContext | null => {
  if (!isPlainObject(context)) {
    return null;
  }

  const userId = toOptionalString(context.userId) || "";
  const repoUrl = normalizeRepoUrl(typeof context.repoUrl === "string" ? context.repoUrl : "");
  const defaultBranch = toOptionalString(context.defaultBranch);
  const commitSha = toOptionalString(context.commitSha);
  const branch = resolveBranchName(toOptionalString(context.branch), defaultBranch, commitSha);

  if (!userId || !repoUrl || !branch) {
    return null;
  }

  return {
    userId,
    repoUrl,
    branch,
    defaultBranch,
    commitSha,
  };
};

const isSandboxCommandRunner = (value: unknown): value is SandboxCommandRunner =>
  isPlainObject(value) && typeof value.runCommand === "function";

const parseGitStateOutput = (raw: string): Partial<Omit<RepoContext, "userId">> => {
  const state = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex <= 0) {
          return null;
        }
        return [
          line.slice(0, separatorIndex).trim(),
          line.slice(separatorIndex + 1).trim(),
        ] as const;
      })
      .filter((entry): entry is readonly [string, string] => Boolean(entry)),
  );
  const repoUrl = normalizeRepoUrl(typeof state.origin === "string" ? state.origin : "");
  const defaultBranch = toOptionalString(state.defaultBranch);
  const commitSha = toOptionalString(state.commitSha);
  const branch = resolveBranchName(toOptionalString(state.branch), defaultBranch, commitSha);
  if (!repoUrl || !branch) {
    return {};
  }
  return {
    repoUrl,
    branch,
    defaultBranch,
    commitSha,
  };
};

const extractUserId = (context: unknown): string => {
  if (!isPlainObject(context)) {
    return "";
  }
  return toOptionalString(context.userId) || "";
};

const resolveRepoContext = async (context: {
  conversationContext?: unknown;
  getSandbox: () => Promise<unknown>;
  signal?: AbortSignal;
}): Promise<RepoContext | null> => {
  const contextRepo = extractRepoContext(context.conversationContext);
  if (contextRepo) {
    return contextRepo;
  }

  const userId = extractUserId(context.conversationContext);
  if (!userId) {
    return null;
  }

  try {
    const sandbox = await context.getSandbox();
    if (!isSandboxCommandRunner(sandbox)) {
      return null;
    }
    const rawGitState = (await sandbox.runCommand(SANDBOX_GIT_STATE_COMMAND, context.signal)) || "";
    const gitRepo = parseGitStateOutput(rawGitState);
    if (!gitRepo.repoUrl || !gitRepo.branch) {
      return null;
    }
    return {
      userId,
      repoUrl: gitRepo.repoUrl,
      branch: gitRepo.branch,
      defaultBranch: gitRepo.defaultBranch || null,
      commitSha: gitRepo.commitSha || null,
    };
  } catch {
    return null;
  }
};

export const readRepoKnowledgeTool = defineTool<string>({
  name: "readRepoKnowledge",
  description:
    "读取当前仓库/分支的知识 bundle。默认读取 INDEX.md，也可以按 section 或 filePath 渐进式下钻。",
  whenToUse:
    "当当前任务已经绑定仓库，或者你在执行过程中手动拉取/进入了一个 git 仓库，而且你仍缺少仓库结构背景时使用。若 execution handoff、最近诊断或当前上下文已经明确给出目标文件和动作，就不要先读 repo knowledge 复述背景；直接进入修改或验证。如果某个 section 或 evidence 足够回答问题，就不要重复全仓搜索。",
  executionMode: "parallel_readonly",
  workflow: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["design", "verification", "complete"],
      },
      {
        roles: ["verification_reviewer"],
        phases: ["verification"],
      },
    ],
  },
  params: [
    { name: "sectionId", optional: true, description: "要读取的 section ID，和 filePath 二选一" },
    { name: "filePath", optional: true, description: "bundle 内相对路径，默认 INDEX.md" },
    { name: "startLine", optional: true, description: "可选：起始行号（从 1 开始）" },
    { name: "endLine", optional: true, description: "可选：结束行号（包含）" },
  ],
  async invoke({ params, context }) {
    const repoContext = await resolveRepoContext(context);
    if (!repoContext) {
      const message =
        "当前任务既没有可用的仓库上下文，也没能从 sandbox 里的 git 状态识别出 repoUrl/branch，无法读取仓库知识。";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          repoUrl: "",
          branch: "",
          resolvedBranch: null,
          filePath: null,
          startLine: null,
          endLine: null,
          content: "",
          manifest: null,
          message,
        },
      };
    }

    const { bundle, resolvedBranch } = await repoKnowledgeStore.get(repoContext);
    if (!bundle) {
      const message =
        "当前仓库/分支还没有知识 bundle。这是正常的首次初始化场景；先基于实际取证整理 overview / package-map / entrypoints 等 section，再用 upsertRepoKnowledge 写入。";
      return {
        message,
        toolResult: {
          success: true,
          repoUrl: repoContext.repoUrl,
          branch: repoContext.branch,
          resolvedBranch: null,
          filePath: null,
          startLine: null,
          endLine: null,
          content: "",
          manifest: null,
          bundleState: "missing",
          bootstrapRequired: true,
          suggestedSections: ["overview", "package-map", "entrypoints"],
          message,
        },
      };
    }

    const requestedSectionId =
      typeof params.sectionId === "string" && params.sectionId.trim()
        ? normalizeSectionId(params.sectionId)
        : "";
    const requestedFilePath =
      typeof params.filePath === "string" && params.filePath.trim()
        ? normalizePath(params.filePath)
        : "";
    const targetFilePath =
      requestedFilePath ||
      (requestedSectionId
        ? bundle.manifest.sections.find((section) => section.id === requestedSectionId)?.filePath ||
          ""
        : INDEX_FILE_PATH) ||
      INDEX_FILE_PATH;

    const rawContent = bundle.files[targetFilePath];
    if (typeof rawContent !== "string") {
      const message = `未找到仓库知识文件: ${targetFilePath}`;
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          repoUrl: bundle.manifest.repoUrl,
          branch: repoContext.branch,
          resolvedBranch,
          filePath: null,
          startLine: null,
          endLine: null,
          content: "",
          manifest: bundle.manifest,
          message,
        },
      };
    }

    const sliced = sliceContentByLines(rawContent, params.startLine, params.endLine);
    return {
      message: `已读取仓库知识 ${targetFilePath}${resolvedBranch && resolvedBranch !== repoContext.branch ? `（回退到 ${resolvedBranch}）` : ""}`,
      toolResult: {
        success: true,
        repoUrl: bundle.manifest.repoUrl,
        branch: repoContext.branch,
        resolvedBranch,
        filePath: targetFilePath,
        startLine: sliced.startLine,
        endLine: sliced.endLine,
        content: sliced.content,
        manifest: bundle.manifest,
        message: `已读取仓库知识 ${targetFilePath}`,
      },
    };
  },
});

export const upsertRepoKnowledgeTool = defineTool<string>({
  name: "upsertRepoKnowledge",
  description:
    "写入或修正当前仓库/分支的知识 bundle。按 section 更新，并可附带一组 evidence 文件。",
  whenToUse:
    "只有在你已经基于 readFile/listFiles/bash/LSP 得到明确证据后，才写入或修正仓库知识。不要把猜测写成事实；不确定的内容放在 evidence 或正文里明确标注为推断。",
  workflow: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["requirements", "execution", "verification", "complete"],
      },
      {
        roles: ["execution_worker"],
        phases: ["execution"],
      },
      {
        roles: ["verification_reviewer"],
        phases: ["verification"],
      },
    ],
  },
  params: [
    { name: "sectionId", optional: false, description: "要写入的 section ID" },
    { name: "title", optional: false, description: "section 标题" },
    { name: "summary", optional: false, description: "section 摘要" },
    { name: "content", optional: false, description: "section 正文 markdown" },
    {
      name: "evidenceFiles",
      optional: true,
      description: "附带写入的 evidence 文件集合",
      type: "array",
      params: [
        { name: "filePath", optional: false, description: "evidence 相对路径" },
        { name: "content", optional: false, description: "evidence markdown 正文" },
      ],
    },
    { name: "lastVerifiedCommit", optional: true, description: "本次写入对应的最后验证 commit" },
  ],
  async invoke({ params, context }) {
    const repoContext = await resolveRepoContext(context);
    if (!repoContext) {
      const message =
        "当前任务既没有可用的仓库上下文，也没能从 sandbox 里的 git 状态识别出 repoUrl/branch，无法写入仓库知识。";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          repoUrl: "",
          branch: "",
          version: 0,
          updatedFiles: [],
          manifest: {
            title: "",
            repoUrl: "",
            branch: "",
            defaultBranch: null,
            version: 0,
            updatedAt: new Date(0).toISOString(),
            sections: [],
            files: [],
          },
          message,
        },
      };
    }

    const evidenceFiles = Array.isArray(params.evidenceFiles)
      ? params.evidenceFiles
          .map((item) => {
            if (
              !isPlainObject(item) ||
              typeof item.filePath !== "string" ||
              typeof item.content !== "string"
            ) {
              return null;
            }
            return {
              path: item.filePath,
              content: item.content,
            };
          })
          .filter((item): item is { path: string; content: string } => Boolean(item))
      : [];

    const bundle = await repoKnowledgeStore.upsert({
      userId: repoContext.userId,
      ownerConversationId: context.parentId || context.taskId,
      repoUrl: repoContext.repoUrl,
      branch: repoContext.branch,
      defaultBranch: repoContext.defaultBranch || undefined,
      sectionId: typeof params.sectionId === "string" ? params.sectionId : "",
      title: typeof params.title === "string" ? params.title : "",
      summary: typeof params.summary === "string" ? params.summary : "",
      content: typeof params.content === "string" ? params.content : "",
      evidenceFiles,
      lastVerifiedCommit:
        typeof params.lastVerifiedCommit === "string" && params.lastVerifiedCommit.trim()
          ? params.lastVerifiedCommit.trim()
          : repoContext.commitSha || undefined,
    });

    const sectionId = normalizeSectionId(String(params.sectionId || ""));
    const updatedSection = bundle.manifest.sections.find((section) => section.id === sectionId);
    const updatedFiles = [
      updatedSection?.filePath || "",
      ...((updatedSection?.evidenceFiles || []) as string[]),
      INDEX_FILE_PATH,
    ].filter(Boolean);

    return {
      message: `已更新仓库知识 section ${sectionId || "unknown"}`,
      toolResult: {
        success: true,
        repoUrl: bundle.manifest.repoUrl,
        branch: bundle.manifest.branch,
        version: bundle.manifest.version,
        updatedFiles,
        manifest: bundle.manifest,
        message: `已更新仓库知识 section ${sectionId || "unknown"}`,
      },
    };
  },
});
