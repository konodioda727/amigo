import path from "node:path";
import type { ListFilesResult } from "@amigo-llm/types";
import type { Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createTool } from "./base";
import { buildListFilesTree } from "./listFilesTree";
import { createToolResult } from "./result";

const DEFAULT_DIRECTORY_PATH = ".";
const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_ENTRIES = 200;
const MAX_ALLOWED_DEPTH = 8;
const MAX_ALLOWED_ENTRIES = 500;

const normalizeDirectoryPath = (directoryPath: string | undefined): string => {
  const trimmed = (directoryPath || "").trim();
  if (!trimmed) {
    return DEFAULT_DIRECTORY_PATH;
  }

  return trimmed.replace(/^(\.\/)+/, "") || DEFAULT_DIRECTORY_PATH;
};

const escapeShellPath = (filePath: string) => filePath.replaceAll("'", "'\\''");

const clampPositiveInteger = (value: unknown, fallback: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.floor(parsed)));
};

const buildListFilesContinuationSummary = (directoryPath: string): string =>
  `【已列出 ${directoryPath}】`;

const createInvalidResult = (
  directoryPath: string,
  message: string,
  options?: Partial<Pick<ListFilesResult, "maxDepth" | "includeHidden" | "maxEntries">>,
) =>
  createToolResult(
    {
      success: false,
      directoryPath,
      tree: `${directoryPath === "." ? "." : directoryPath}/`,
      entries: [],
      truncated: false,
      maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
      includeHidden: options?.includeHidden ?? false,
      maxEntries: options?.maxEntries ?? DEFAULT_MAX_ENTRIES,
      message,
    } satisfies ListFilesResult,
    {
      transportMessage: message,
      continuationSummary: message,
    },
  );

const buildFindCommand = (params: {
  directoryPath: string;
  maxDepth: number;
  includeHidden: boolean;
  maxEntries: number;
}): string => {
  const escapedDirectoryPath = escapeShellPath(params.directoryPath);
  const hiddenClause = params.includeHidden ? "" : `\\( -path '*/.*' -o -name '.*' \\) -prune -o `;

  return [
    `find '${escapedDirectoryPath}' -maxdepth ${params.maxDepth} ${hiddenClause}-mindepth 1 -print`,
    "LC_ALL=C sort",
    `head -n ${params.maxEntries + 1}`,
    `while IFS= read -r entry; do
  if [ -d "$entry" ]; then
    printf 'directory\\t%s\\n' "$entry"
  else
    printf 'file\\t%s\\n' "$entry"
  fi
done`,
  ].join(" | ");
};

const parseListOutput = (
  output: string,
  directoryPath: string,
  maxEntries: number,
): Pick<ListFilesResult, "entries" | "truncated"> => {
  const normalizedRoot = directoryPath === "." ? "." : directoryPath.replace(/\/+$/, "") || ".";
  const rows = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const truncated = rows.length > maxEntries;
  const limitedRows = rows.slice(0, maxEntries);

  return {
    truncated,
    entries: limitedRows
      .map((row) => {
        const [rawType, ...pathParts] = row.split("\t");
        const entryPath = pathParts.join("\t").trim();
        const type = rawType === "directory" ? "directory" : rawType === "file" ? "file" : "";
        if (!entryPath || !type) {
          return null;
        }

        const relativePath =
          normalizedRoot === "."
            ? entryPath.replace(/^\.\/?/, "")
            : path.posix.relative(normalizedRoot, entryPath);
        const sanitizedRelativePath = relativePath === "" ? "." : relativePath;
        const depth =
          sanitizedRelativePath === "."
            ? 0
            : sanitizedRelativePath.split("/").filter(Boolean).length;

        return {
          path: entryPath,
          name: path.posix.basename(entryPath),
          type,
          depth,
        } as ListFilesResult["entries"][number];
      })
      .filter((entry): entry is ListFilesResult["entries"][number] => !!entry),
  };
};

export const ListFiles = createTool({
  name: "listFiles",
  description:
    "列出目录中的文件和子目录。用于在读取文件前快速了解仓库或某个目录的结构，不返回文件正文。",
  whenToUse:
    "当你不知道确切文件名、需要先浏览目录结构、缩小 readFile 范围时使用。不要用它代替 readFile 读取内容。",
  params: [
    {
      name: "directoryPath",
      optional: true,
      description: "可选：要列出的目录路径；支持相对于沙箱工作目录的路径或绝对路径，默认当前目录",
    },
    {
      name: "maxDepth",
      optional: true,
      description: "可选：最大递归深度，1 表示仅列出直接子项，默认 2",
    },
    {
      name: "includeHidden",
      optional: true,
      description: "可选：是否包含隐藏文件和隐藏目录，默认 false",
    },
    {
      name: "maxEntries",
      optional: true,
      description: `可选：最多返回多少条结果，默认 ${DEFAULT_MAX_ENTRIES}，最大 ${MAX_ALLOWED_ENTRIES}`,
    },
  ],
  async invoke({ params, context }) {
    const directoryPath = normalizeDirectoryPath(
      typeof params.directoryPath === "string" ? params.directoryPath : undefined,
    );
    const maxDepth = clampPositiveInteger(params.maxDepth, DEFAULT_MAX_DEPTH, MAX_ALLOWED_DEPTH);
    const includeHidden = params.includeHidden === true;
    const maxEntries = clampPositiveInteger(
      params.maxEntries,
      DEFAULT_MAX_ENTRIES,
      MAX_ALLOWED_ENTRIES,
    );

    try {
      const sandbox = (await context.getSandbox()) as Sandbox;
      if (!sandbox || !sandbox.isRunning()) {
        return createInvalidResult(directoryPath, "沙箱未运行，无法列出目录", {
          maxDepth,
          includeHidden,
          maxEntries,
        });
      }

      const escapedDirectoryPath = escapeShellPath(directoryPath);
      const existsResult = await sandbox.runCommand(
        `test -d '${escapedDirectoryPath}' && echo "exists" || echo "not_found"`,
      );
      if (!existsResult?.includes("exists")) {
        return createInvalidResult(directoryPath, `目录不存在: ${directoryPath}`, {
          maxDepth,
          includeHidden,
          maxEntries,
        });
      }

      const output =
        (await sandbox.runCommand(
          buildFindCommand({ directoryPath, maxDepth, includeHidden, maxEntries }),
        )) || "";
      const { entries, truncated } = parseListOutput(output, directoryPath, maxEntries);
      const tree = buildListFilesTree(directoryPath, entries);
      const message = truncated
        ? `已列出目录 ${directoryPath} 的前 ${entries.length} 项（结果已截断）`
        : `已列出目录 ${directoryPath}，共 ${entries.length} 项`;

      const result = {
        success: true,
        directoryPath,
        tree,
        entries,
        truncated,
        maxDepth,
        includeHidden,
        maxEntries,
        message,
      } satisfies ListFilesResult;

      logger.info(`[ListFiles] ${message}`);
      return createToolResult(result, {
        transportMessage: message,
        continuationSummary: buildListFilesContinuationSummary(directoryPath),
      });
    } catch (error) {
      const errorMsg = `列出目录失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[ListFiles] ${errorMsg}`);
      return createInvalidResult(directoryPath, errorMsg, {
        maxDepth,
        includeHidden,
        maxEntries,
      });
    }
  },
});
