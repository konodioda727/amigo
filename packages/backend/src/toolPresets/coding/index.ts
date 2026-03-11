import type { Sandbox } from "@/core/sandbox";
import { queueToolRetryAfterDependencies } from "@/core/tools/dependencyWorkflow";
import { normalizeSandboxToolWorkingDir } from "@/core/tools/sandboxDependency";
import { defineTool } from "@/sdk";
import { logger } from "@/utils/logger";

const EXIT_SENTINEL = "__AMIGO_EXIT_CODE__:";
const DEFAULT_CHECK_TIMEOUT_MS = 120_000;
const DEFAULT_OUTPUT_TAIL_LINES = 80;
const ALLOWED_CHECK_PREFIXES = ["bun", "pnpm", "npm", "yarn", "npx", "pytest", "cargo", "go", "uv"];
const BLOCKED_CHECK_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bgit\s+reset\b/i,
  /\bgit\s+checkout\s+--\b/i,
  /\bgit\s+clean\b/i,
];

interface PackageJsonLike {
  packageManager?: string;
  scripts?: Record<string, string>;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function toBoolean(value: unknown, defaultValue = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return defaultValue;
}

function toPositiveInt(value: unknown, defaultValue: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultValue;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function trimOutputTail(output: string, lineLimit: number): string {
  if (!output) return "";
  const lines = output.split(/\r?\n/);
  return (lines.length <= lineLimit ? lines : lines.slice(-lineLimit)).join("\n").trim();
}

async function runCommandWithExitCode(
  sandbox: Sandbox,
  command: string,
  signal?: AbortSignal,
): Promise<{ output: string; exitCode: number }> {
  const raw = (await sandbox.runCommand(`${command}; echo ${EXIT_SENTINEL}$?`, signal)) || "";
  const lines = raw.split(/\r?\n/);
  let exitCode = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim() || "";
    if (!line.startsWith(EXIT_SENTINEL)) continue;
    exitCode = Number.parseInt(line.slice(EXIT_SENTINEL.length), 10) || 0;
    lines.splice(i, 1);
    break;
  }

  return { output: lines.join("\n").trim(), exitCode };
}

async function runSandboxCommandWithTimeout(
  sandbox: Sandbox,
  command: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ output: string; exitCode: number; timedOut: boolean }> {
  const controller = new AbortController();
  let timedOut = false;

  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const result = await runCommandWithExitCode(sandbox, command, controller.signal);
    return { ...result, timedOut: false };
  } catch (error) {
    if (
      (error instanceof Error && error.name === "AbortError") ||
      timedOut ||
      controller.signal.aborted
    ) {
      return { output: "", exitCode: -1, timedOut: true };
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function getFirstToken(command: string): string {
  return command.trim().split(/\s+/)[0] || "";
}

function isBlockedCheckCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) return "命令不能为空";
  if (/[;&|><`]/.test(trimmed) || /\$\(/.test(trimmed)) {
    return "runChecks 不允许复合 shell 操作符；请拆分为多条 commands";
  }
  for (const pattern of BLOCKED_CHECK_PATTERNS) {
    if (pattern.test(trimmed)) return `命令包含被禁止的危险操作: ${trimmed}`;
  }
  const token = getFirstToken(trimmed);
  if (!ALLOWED_CHECK_PREFIXES.includes(token)) return `命令前缀不在允许列表中: ${token}`;
  return null;
}

async function readPackageJson(
  sandbox: Sandbox,
  workingDir: string,
  signal?: AbortSignal,
): Promise<PackageJsonLike | null> {
  const dir = workingDir === "." ? "." : workingDir;
  const cmd = `test -f ${shellQuote(`${dir}/package.json`)} && cat ${shellQuote(
    `${dir}/package.json`,
  )} || echo "__AMIGO_NO_PACKAGE_JSON__"`;
  const output = await sandbox.runCommand(cmd, signal);
  const text = (output || "").trim();
  if (!text || text === "__AMIGO_NO_PACKAGE_JSON__") return null;
  try {
    return JSON.parse(text) as PackageJsonLike;
  } catch (error) {
    logger.warn("[AppTools] package.json parse failed:", error);
    return null;
  }
}

function detectScriptRunner(pkg: PackageJsonLike | null): string {
  const pm = pkg?.packageManager || "";
  if (pm.startsWith("pnpm@")) return "pnpm run";
  if (pm.startsWith("bun@")) return "bun run";
  if (pm.startsWith("yarn@")) return "yarn";
  if (pm.startsWith("npm@")) return "npm run";
  return "npm run";
}

function pickScriptName(scripts: Record<string, string>, candidates: string[]): string | undefined {
  return candidates.find((name) => !!scripts[name]);
}

function buildCheckSteps(
  preset: string,
  pkg: PackageJsonLike | null,
): Array<{ name: string; command: string }> {
  const scripts = pkg?.scripts || {};
  const runner = detectScriptRunner(pkg);
  const scriptMap = {
    lint: pickScriptName(scripts, ["lint", "check:lint", "eslint"]),
    typecheck: pickScriptName(scripts, ["typecheck", "check-types", "check:type", "types"]),
    test: pickScriptName(scripts, ["test", "test:unit"]),
    build: pickScriptName(scripts, ["build"]),
  };

  const step = (key: keyof typeof scriptMap) => {
    const script = scriptMap[key];
    if (!script) return null;
    return {
      name: key,
      command: runner === "yarn" ? `yarn ${script}` : `${runner} ${script}`,
    };
  };
  const isDefinedStep = (
    value: ReturnType<typeof step>,
  ): value is NonNullable<ReturnType<typeof step>> => value !== null;

  if (preset === "quick") {
    const keys: Array<keyof typeof scriptMap> = [];
    if (scriptMap.lint) keys.push("lint");
    if (scriptMap.typecheck) keys.push("typecheck");
    if (keys.length === 0 && scriptMap.test) keys.push("test");
    if (keys.length === 0 && scriptMap.build) keys.push("build");
    return keys.map((key) => step(key)).filter(isDefinedStep);
  }

  if (preset === "all") {
    return (["lint", "typecheck", "test", "build"] as Array<keyof typeof scriptMap>)
      .map((key) => step(key))
      .filter(isDefinedStep);
  }

  const single = step(preset as keyof typeof scriptMap);
  return single ? [single] : [];
}

function commandNameSlug(command: string): string {
  return command.replace(/[:/\s]+/g, "_");
}

export const repoSearchTool = defineTool({
  name: "repoSearch",
  description: "在沙箱仓库中使用 ripgrep (rg) 搜索代码/文本，返回结构化匹配结果。",
  whenToUse:
    "在仓库内定位代码、错误文本或配置引用时使用。推荐链路：repoSearch -> readFile -> editFile。",
  params: [
    { name: "query", optional: false, description: "搜索关键词（默认按正则）" },
    { name: "path", optional: true, description: "搜索路径（相对 /sandbox）" },
    {
      name: "glob",
      optional: true,
      type: "array",
      description: "包含 glob 列表",
      params: [{ name: "pattern", optional: false, description: "glob 模式，如 *.ts" }],
    },
    {
      name: "exclude",
      optional: true,
      type: "array",
      description: "排除 glob/目录列表",
      params: [{ name: "pattern", optional: false, description: "排除模式，如 node_modules" }],
    },
    { name: "caseSensitive", optional: true, description: "是否区分大小写（默认 false）" },
    { name: "fixedStrings", optional: true, description: "是否按字面量搜索（默认 false）" },
    { name: "maxResults", optional: true, description: "最大返回匹配数（默认 50）" },
    { name: "maxFileMatches", optional: true, description: "每个文件最大匹配数（默认 20）" },
  ],
  async invoke({ params, context }) {
    const query = typeof params.query === "string" ? params.query : "";
    const relativePath = typeof params.path === "string" && params.path.trim() ? params.path : ".";
    const glob = toStringArray(params.glob);
    const exclude = toStringArray(params.exclude);
    const fixedStrings = toBoolean(params.fixedStrings, false);
    const caseSensitive = toBoolean(params.caseSensitive, false);
    const maxResults = toPositiveInt(params.maxResults, 50);
    const maxFileMatches = toPositiveInt(params.maxFileMatches, 20);

    if (!query.trim()) {
      const message = "repoSearch 的 query 不能为空";
      return {
        message,
        toolResult: {
          success: false,
          query: "",
          command: "",
          matches: [],
          totalMatches: 0,
          returnedMatches: 0,
          truncated: false,
          message,
        },
      };
    }

    try {
      const sandbox = (await context.getSandbox()) as Sandbox;
      if (!sandbox || !sandbox.isRunning()) {
        const message = "沙箱未运行，无法执行 repoSearch";
        return {
          message,
          toolResult: {
            success: false,
            query,
            command: "",
            matches: [],
            totalMatches: 0,
            returnedMatches: 0,
            truncated: false,
            message,
          },
        };
      }

      const cleanPath = String(relativePath).replace(/^(\.\/|\/)+/, "") || ".";
      const args = ["rg", "--line-number", "--column", "--no-heading", "--color", "never"];
      if (fixedStrings) args.push("--fixed-strings");
      if (!caseSensitive) args.push("--ignore-case");
      args.push("-m", String(maxFileMatches));
      for (const pattern of glob) args.push("--glob", pattern);
      for (const pattern of exclude)
        args.push("--glob", pattern.startsWith("!") ? pattern : `!${pattern}`);
      args.push(query, cleanPath);

      const command = args.map(shellQuote).join(" ");
      const { output, exitCode } = await runCommandWithExitCode(sandbox, command, context.signal);
      if (exitCode > 1) {
        const message = `repoSearch 执行失败（exitCode=${exitCode}）${output ? `\n${output}` : ""}`;
        return {
          message,
          toolResult: {
            success: false,
            query,
            command,
            matches: [],
            totalMatches: 0,
            returnedMatches: 0,
            truncated: false,
            message,
          },
        };
      }

      const matches = output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const match = line.match(/^(.*?):(\d+):(\d+):(.*)$/);
          if (!match) return null;
          return {
            file: match[1] || "",
            line: Number.parseInt(match[2] || "0", 10),
            column: Number.parseInt(match[3] || "0", 10),
            text: (match[4] || "").trim(),
          };
        })
        .filter(
          (item): item is { file: string; line: number; column: number; text: string } => !!item,
        );

      const totalMatches = matches.length;
      const returnedMatches = Math.min(totalMatches, maxResults);
      const truncated = totalMatches > maxResults;
      const message =
        totalMatches === 0
          ? `repoSearch 未找到匹配（query="${query}"）`
          : `repoSearch 找到 ${totalMatches} 条匹配，返回 ${returnedMatches} 条${truncated ? "（已截断）" : ""}`;

      return {
        message,
        toolResult: {
          success: true,
          query,
          command,
          matches: matches.slice(0, maxResults),
          totalMatches,
          returnedMatches,
          truncated,
          message,
        },
      };
    } catch (error) {
      const message = `repoSearch 执行异常: ${error instanceof Error ? error.message : String(error)}`;
      logger.error("[AppTools][repoSearch] error:", error);
      return {
        message,
        toolResult: {
          success: false,
          query,
          command: "",
          matches: [],
          totalMatches: 0,
          returnedMatches: 0,
          truncated: false,
          message,
        },
      };
    }
  },
});

export const runChecksTool = defineTool({
  name: "runChecks",
  description: "统一运行 lint/test/typecheck/build 等检查，返回结构化结果。",
  whenToUse:
    "代码改动后做验证闭环时使用。调用前先阅读目标目录的 package.json 和相关 README/文档；非必要不要用 npm，优先沿用项目自己的 bun/pnpm/yarn 脚本。优先把仓库里真实存在的脚本以 commands 显式传入，只有在脚本约定非常清晰时才使用 preset。若依赖尚未安装，不要让后端猜安装命令，应先调用 installDependencies 并传入你基于仓库事实决定的 installCommand。",
  params: [
    {
      name: "preset",
      optional: true,
      description:
        "quick/lint/test/typecheck/build/all。仅在你已经确认仓库脚本命名足够常规时使用。",
    },
    { name: "workingDir", optional: true, description: "工作目录（相对 /sandbox）" },
    { name: "stopOnFail", optional: true, description: "遇到失败是否停止（默认 false）" },
    { name: "timeoutMs", optional: true, description: "每步骤超时时间（毫秒，默认 120000）" },
    {
      name: "includeOutputTailLines",
      optional: true,
      description: "每步骤返回输出尾部行数（默认 80）",
    },
    {
      name: "commands",
      optional: true,
      type: "array",
      description:
        "自定义检查命令列表（覆盖 preset）。推荐在读过 package.json/README 后，把项目真实使用的 bun/pnpm/yarn 脚本显式传进来；只有项目明确要求时才使用 npm。",
      params: [
        { name: "command", optional: false, description: "单条检查命令，例如 `bun run lint`" },
      ],
    },
  ],
  async invoke({ params, context }) {
    const preset = typeof params.preset === "string" ? params.preset : "quick";
    const stopOnFail = toBoolean(params.stopOnFail, false);
    const timeoutMs = toPositiveInt(params.timeoutMs, DEFAULT_CHECK_TIMEOUT_MS);
    const tailLines = toPositiveInt(params.includeOutputTailLines, DEFAULT_OUTPUT_TAIL_LINES);
    const customCommands = toStringArray(params.commands);
    const workingDir = normalizeSandboxToolWorkingDir(
      typeof params.workingDir === "string" ? params.workingDir : undefined,
    );

    try {
      const sandbox = (await context.getSandbox()) as Sandbox;
      if (!sandbox || !sandbox.isRunning()) {
        const message = "沙箱未运行，无法执行 runChecks";
        return {
          message,
          toolResult: {
            success: false,
            overallStatus: "failed",
            preset: customCommands.length ? "custom" : preset,
            workingDir,
            failedSteps: [],
            steps: [],
            message,
          },
        };
      }

      const dependencyStatus = sandbox.getDependencyInstallStatus(workingDir);
      const sandboxTaskId = context.parentId || context.taskId;
      if (dependencyStatus.status === "running") {
        const waitingJob = queueToolRetryAfterDependencies({
          context,
          sandbox,
          sandboxTaskId,
          toolName: "runChecks",
          workingDir,
          toolParams: {
            preset,
            workingDir,
            stopOnFail,
            timeoutMs,
            includeOutputTailLines: tailLines,
            ...(customCommands.length > 0 ? { commands: customCommands } : {}),
          },
          successPrompt: `依赖安装已完成。请立即继续之前等待的 runChecks 调用，参数如下：\n${JSON.stringify(
            {
              preset,
              workingDir,
              stopOnFail,
              timeoutMs,
              includeOutputTailLines: tailLines,
              ...(customCommands.length > 0 ? { commands: customCommands } : {}),
            },
          )}\n不要再次请求用户确认，也不要重复安装依赖；先直接执行 runChecks，不要先单独向用户汇报“依赖已安装完成”。`,
          failurePrompt: (errorMessage) =>
            `之前等待的 runChecks 未执行，因为依赖安装失败。\n错误信息：${errorMessage}\n请先处理依赖安装问题，再决定下一步。`,
        });
        const message = waitingJob.started
          ? "依赖正在下载中，runChecks 会在下载完成后自动运行。"
          : "runChecks 正在等待依赖下载完成，完成后会自动运行。";

        return {
          message,
          toolResult: {
            success: false,
            async: true,
            overallStatus: "waiting_for_dependencies",
            preset: customCommands.length ? "custom" : preset,
            workingDir,
            failedSteps: [],
            steps: [],
            dependencyStatus: dependencyStatus.status,
            jobId: waitingJob.job.id,
            message,
          },
        };
      }

      if (dependencyStatus.status === "idle") {
        const message =
          "依赖尚未安装。请先读取目标目录的 package.json/README/锁文件，确认真实安装方式后调用 installDependencies，并传入明确的 installCommand。";
        return {
          message,
          toolResult: {
            success: false,
            overallStatus: "failed",
            preset: customCommands.length ? "custom" : preset,
            workingDir,
            failedSteps: [],
            steps: [],
            message,
          },
        };
      }

      if (dependencyStatus.status === "failed") {
        const message = `依赖安装失败，请先修复后再执行 runChecks。日志: ${dependencyStatus.logPath}${dependencyStatus.error ? `\n\n最近错误:\n${dependencyStatus.error}` : ""}`;
        return {
          message,
          toolResult: {
            success: false,
            overallStatus: "failed",
            preset: customCommands.length ? "custom" : preset,
            workingDir,
            failedSteps: [],
            steps: [],
            message,
          },
        };
      }

      let stepsToRun: Array<{ name: string; command: string }> = [];
      let presetLabel = preset;
      if (customCommands.length > 0) {
        presetLabel = "custom";
        stepsToRun = customCommands.map((command, index) => ({
          name: `custom_${index + 1}_${commandNameSlug(getFirstToken(command) || "check")}`,
          command,
        }));
      } else {
        const pkg = await readPackageJson(sandbox, workingDir, context.signal);
        stepsToRun = buildCheckSteps(preset, pkg);
      }

      if (stepsToRun.length === 0) {
        const message =
          customCommands.length > 0
            ? "runChecks 未收到可执行命令"
            : `runChecks 无法从 package.json 推断 preset='${preset}' 的检查命令`;
        return {
          message,
          toolResult: {
            success: false,
            overallStatus: "failed",
            preset: presetLabel,
            workingDir,
            failedSteps: [],
            steps: [],
            message,
          },
        };
      }

      const steps: Array<{
        name: string;
        command: string;
        status: "passed" | "failed" | "timeout" | "blocked";
        exitCode?: number;
        durationMs: number;
        outputTail: string;
      }> = [];

      for (const step of stepsToRun) {
        const startedAt = Date.now();

        if (presetLabel === "custom") {
          const blockReason = isBlockedCheckCommand(step.command);
          if (blockReason) {
            steps.push({
              name: step.name,
              command: step.command,
              status: "blocked",
              durationMs: Date.now() - startedAt,
              outputTail: blockReason,
            });
            if (stopOnFail) break;
            continue;
          }
        }

        context.postMessage?.({
          type: "runChecksStep",
          status: "running",
          name: step.name,
          command: step.command,
        });

        const fullCommand =
          (workingDir === "." ? "" : `cd ${shellQuote(workingDir)} && `) + step.command;

        try {
          const { output, exitCode, timedOut } = await runSandboxCommandWithTimeout(
            sandbox,
            fullCommand,
            timeoutMs,
            context.signal,
          );
          const result = {
            name: step.name,
            command: step.command,
            status: (timedOut ? "timeout" : exitCode === 0 ? "passed" : "failed") as
              | "passed"
              | "failed"
              | "timeout"
              | "blocked",
            exitCode: timedOut ? undefined : exitCode,
            durationMs: Date.now() - startedAt,
            outputTail: timedOut
              ? `步骤超时（>${timeoutMs}ms）`
              : trimOutputTail(output, tailLines),
          };
          steps.push(result);
          context.postMessage?.({
            type: "runChecksStep",
            status: result.status,
            name: result.name,
            exitCode: result.exitCode,
          });
          if (stopOnFail && result.status !== "passed") break;
        } catch (error) {
          const result = {
            name: step.name,
            command: step.command,
            status: "failed" as const,
            durationMs: Date.now() - startedAt,
            outputTail: `执行异常: ${error instanceof Error ? error.message : String(error)}`,
          };
          steps.push(result);
          if (stopOnFail) break;
        }
      }

      const failedSteps = steps.filter((s) => s.status !== "passed").map((s) => s.name);
      const success = steps.length > 0 && failedSteps.length === 0;
      const overallStatus = success
        ? "passed"
        : failedSteps.length < steps.length
          ? "partial"
          : "failed";
      const message = success
        ? `runChecks 完成：${steps.length} 个步骤全部通过`
        : `runChecks 完成：${steps.length} 个步骤，失败 ${failedSteps.length} 个${failedSteps.length ? `（${failedSteps.join(", ")}）` : ""}`;

      return {
        message,
        toolResult: {
          success,
          overallStatus,
          preset: presetLabel,
          workingDir,
          failedSteps,
          steps,
          message,
        },
      };
    } catch (error) {
      const message = `runChecks 执行异常: ${error instanceof Error ? error.message : String(error)}`;
      logger.error("[AppTools][runChecks] error:", error);
      return {
        message,
        toolResult: {
          success: false,
          overallStatus: "failed",
          preset: customCommands.length ? "custom" : preset,
          workingDir,
          failedSteps: [],
          steps: [],
          message,
        },
      };
    }
  },
});
