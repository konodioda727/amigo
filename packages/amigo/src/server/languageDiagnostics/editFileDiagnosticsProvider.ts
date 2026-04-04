import type {
  EditFileDiagnostics,
  EditFileDiagnosticsProvider,
  EditFileDiagnosticsProviderPayload,
} from "@amigo-llm/backend";
import { logger } from "@amigo-llm/backend";

const SUPPORTED_TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SUPPORTED_PY_EXTENSIONS = new Set([".py"]);
const MAX_DIAGNOSTIC_COUNT = 20;

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;

const getLanguageForPath = (filePath: string): EditFileDiagnostics["language"] | null => {
  const normalized = filePath.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  const extension = dotIndex >= 0 ? normalized.slice(dotIndex) : "";
  if (SUPPORTED_TS_EXTENSIONS.has(extension)) {
    return "typescript";
  }
  if (SUPPORTED_PY_EXTENSIONS.has(extension)) {
    return "python";
  }
  return null;
};

const isEditFileDiagnostics = (value: unknown): value is EditFileDiagnostics => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    (record.language === "typescript" || record.language === "python") &&
    (record.status === "clean" ||
      record.status === "error" ||
      record.status === "tool_unavailable") &&
    typeof record.summary === "string" &&
    typeof record.errorCount === "number" &&
    Array.isArray(record.diagnostics)
  );
};

const buildToolUnavailableDiagnostics = (
  language: NonNullable<ReturnType<typeof getLanguageForPath>>,
  summary?: string,
): EditFileDiagnostics => ({
  language,
  status: "tool_unavailable",
  summary: summary || `${language === "typescript" ? "TypeScript" : "Python"} 诊断不可用，已跳过。`,
  errorCount: 0,
  diagnostics: [],
});

const buildTypeScriptDiagnosticsCommand = (filePath: string): string =>
  `
node <<'NODE' ${shellQuote(filePath)}
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { createRequire } = require("node:module");
const rawFilePath = process.argv[1];
const maxDiagnosticCount = ${MAX_DIAGNOSTIC_COUNT};
const cwd = process.cwd();
const absoluteFilePath = path.isAbsolute(rawFilePath) ? rawFilePath : path.resolve(cwd, rawFilePath);

const toPos = (sourceFile, position, fallbackLine, fallbackColumn, ts) => {
  try {
    const point = ts.getLineAndCharacterOfPosition(sourceFile, position || 0);
    return { line: point.line + 1, column: point.character + 1 };
  } catch {
    return { line: fallbackLine, column: fallbackColumn };
  }
};

const normalizePath = (value) => path.normalize(path.resolve(value));

const loadTypeScript = () => {
  const bases = [path.dirname(absoluteFilePath), cwd];
  for (const base of bases) {
    try {
      const req = createRequire(path.join(base, "__amigo_typescript__.cjs"));
      return req("typescript");
    } catch {}
  }

  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    if (globalRoot) {
      return require(path.join(globalRoot, "typescript"));
    }
  } catch {}

  return null;
};

const ts = loadTypeScript();
if (!ts) {
  console.log(JSON.stringify({
    language: "typescript",
    status: "tool_unavailable",
    summary: "TypeScript 运行时不可用，已跳过项目级诊断。",
    errorCount: 0,
    diagnostics: [],
  }));
  process.exit(0);
}

const configPath = ts.findConfigFile(path.dirname(absoluteFilePath), ts.sys.fileExists, "tsconfig.json");
let summaryPrefix = "项目级 TypeScript 检查";
let diagnostics = [];

try {
  if (configPath) {
    const configResult = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configResult.error) {
      const message = ts.flattenDiagnosticMessageText(configResult.error.messageText, "\\n");
      console.log(JSON.stringify({
        language: "typescript",
        status: "tool_unavailable",
        summary: \`无法读取 tsconfig: \${message}\`,
        errorCount: 0,
        diagnostics: [],
      }));
      process.exit(0);
    }

    const parsed = ts.parseJsonConfigFileContent(
      configResult.config,
      ts.sys,
      path.dirname(configPath),
      undefined,
      configPath,
    );
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: {
        ...parsed.options,
        noEmit: true,
      },
      projectReferences: parsed.projectReferences,
    });
    const targetSourceFile =
      program.getSourceFile(absoluteFilePath) || program.getSourceFile(path.relative(cwd, absoluteFilePath));
    const allDiagnostics = ts.getPreEmitDiagnostics(program);
    const normalizedTargetPath = normalizePath(absoluteFilePath);
    diagnostics = allDiagnostics
      .filter((diag) => diag.category === ts.DiagnosticCategory.Error)
      .filter((diag) => {
        if (!diag.file) {
          return false;
        }
        return normalizePath(diag.file.fileName) === normalizedTargetPath;
      })
      .slice(0, maxDiagnosticCount)
      .map((diag) => {
        const start = toPos(targetSourceFile || diag.file, diag.start, 1, 1, ts);
        const end = toPos(
          targetSourceFile || diag.file,
          (diag.start || 0) + (diag.length || 0),
          start.line,
          start.column,
          ts,
        );
        return {
          source: "typescript",
          severity: "error",
          filePath: rawFilePath,
          line: start.line,
          column: start.column,
          endLine: end.line,
          endColumn: end.column,
          code: typeof diag.code === "number" ? String(diag.code) : undefined,
          message: ts.flattenDiagnosticMessageText(diag.messageText, "\\n"),
        };
      });

    summaryPrefix = "项目级 TypeScript 类型检查";
  } else {
    const compilerOptions = {
      noEmit: true,
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      jsx: path.extname(absoluteFilePath).toLowerCase() === ".tsx" ? ts.JsxEmit.Preserve : undefined,
      skipLibCheck: true,
    };
    const program = ts.createProgram([absoluteFilePath], compilerOptions);
    const sourceFile = program.getSourceFile(absoluteFilePath);
    diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((diag) => diag.category === ts.DiagnosticCategory.Error && diag.file)
      .slice(0, maxDiagnosticCount)
      .map((diag) => {
        const start = toPos(sourceFile || diag.file, diag.start, 1, 1, ts);
        const end = toPos(
          sourceFile || diag.file,
          (diag.start || 0) + (diag.length || 0),
          start.line,
          start.column,
          ts,
        );
        return {
          source: "typescript",
          severity: "error",
          filePath: rawFilePath,
          line: start.line,
          column: start.column,
          endLine: end.line,
          endColumn: end.column,
          code: typeof diag.code === "number" ? String(diag.code) : undefined,
          message: ts.flattenDiagnosticMessageText(diag.messageText, "\\n"),
        };
      });
    summaryPrefix = "单文件 TypeScript 检查";
  }
} catch (error) {
  console.log(JSON.stringify({
    language: "typescript",
    status: "tool_unavailable",
    summary: \`TypeScript 诊断执行失败: \${error instanceof Error ? error.message : String(error)}\`,
    errorCount: 0,
    diagnostics: [],
  }));
  process.exit(0);
}

console.log(JSON.stringify({
  language: "typescript",
  status: diagnostics.length > 0 ? "error" : "clean",
  summary: diagnostics.length > 0 ? \`\${summaryPrefix}发现 \${diagnostics.length} 个错误\` : \`\${summaryPrefix}未发现当前文件错误\`,
  errorCount: diagnostics.length,
  diagnostics,
}));
NODE`.trim();

const buildPythonDiagnosticsCommand = (filePath: string): string =>
  `
node <<'NODE' ${shellQuote(filePath)}
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const rawFilePath = process.argv[1];
const cwd = process.cwd();
const absoluteFilePath = path.isAbsolute(rawFilePath) ? rawFilePath : path.resolve(cwd, rawFilePath);

const findUp = (startDir, fileNames) => {
  let current = startDir;
  while (true) {
    for (const name of fileNames) {
      const candidate = path.join(current, name);
      try {
        require("node:fs").accessSync(candidate);
        return candidate;
      } catch {}
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
};

const toolCheck = spawnSync("pyright", ["--version"], { encoding: "utf8" });
if (toolCheck.error) {
  console.log(JSON.stringify({
    language: "python",
    status: "tool_unavailable",
    summary: "pyright 不可用，已跳过 Python 项目级诊断。",
    errorCount: 0,
    diagnostics: [],
  }));
  process.exit(0);
}

const projectConfig =
  findUp(path.dirname(absoluteFilePath), ["pyrightconfig.json", "pyproject.toml"]);
const args = ["--outputjson", absoluteFilePath];
if (projectConfig) {
  args.unshift("--project", projectConfig);
}

const result = spawnSync("pyright", args, { encoding: "utf8" });
const stdout = (result.stdout || "").trim();
if (!stdout) {
  console.log(JSON.stringify({
    language: "python",
    status: "tool_unavailable",
    summary: "pyright 未返回可解析结果，已跳过 Python 项目级诊断。",
    errorCount: 0,
    diagnostics: [],
  }));
  process.exit(0);
}

try {
  const payload = JSON.parse(stdout);
  const diagnostics = Array.isArray(payload.generalDiagnostics)
    ? payload.generalDiagnostics
        .filter((item) => item && typeof item === "object")
        .filter((item) => {
          const file = typeof item.file === "string" ? path.resolve(item.file) : "";
          return file === absoluteFilePath && item.severity === "error";
        })
        .slice(0, ${MAX_DIAGNOSTIC_COUNT})
        .map((item) => ({
          source: "python",
          severity: "error",
          filePath: rawFilePath,
          line: typeof item.range?.start?.line === "number" ? item.range.start.line + 1 : 1,
          column: typeof item.range?.start?.character === "number" ? item.range.start.character + 1 : 1,
          endLine: typeof item.range?.end?.line === "number" ? item.range.end.line + 1 : undefined,
          endColumn: typeof item.range?.end?.character === "number" ? item.range.end.character + 1 : undefined,
          code: typeof item.rule === "string" ? item.rule : undefined,
          message: typeof item.message === "string" ? item.message : "Unknown pyright error",
        }))
    : [];

  console.log(JSON.stringify({
    language: "python",
    status: diagnostics.length > 0 ? "error" : "clean",
    summary: diagnostics.length > 0 ? \`项目级 Python 检查发现 \${diagnostics.length} 个错误\` : "项目级 Python 检查未发现当前文件错误",
    errorCount: diagnostics.length,
    diagnostics,
  }));
} catch (error) {
  console.log(JSON.stringify({
    language: "python",
    status: "tool_unavailable",
    summary: \`pyright 输出解析失败: \${error instanceof Error ? error.message : String(error)}\`,
    errorCount: 0,
    diagnostics: [],
  }));
}
NODE`.trim();

const runDiagnosticsCommand = async (
  payload: EditFileDiagnosticsProviderPayload,
  command: string,
  language: NonNullable<ReturnType<typeof getLanguageForPath>>,
): Promise<EditFileDiagnostics> => {
  try {
    const output = await payload.sandbox.runCommand(command, payload.signal);
    if (output?.trim()) {
      const parsed = JSON.parse(output) as unknown;
      if (isEditFileDiagnostics(parsed)) {
        return parsed;
      }
    }
  } catch (error) {
    logger.warn(
      `[AmigoApp] 运行 ${language} 编辑后诊断失败 ${payload.filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return buildToolUnavailableDiagnostics(language);
};

export const createEditFileDiagnosticsProvider = (): EditFileDiagnosticsProvider => {
  return async (payload) => {
    const language = getLanguageForPath(payload.filePath);
    if (!language) {
      return undefined;
    }

    const command =
      language === "typescript"
        ? buildTypeScriptDiagnosticsCommand(payload.filePath)
        : buildPythonDiagnosticsCommand(payload.filePath);

    return runDiagnosticsCommand(payload, command, language);
  };
};

export const __testing__ = {
  buildPythonDiagnosticsCommand,
  buildTypeScriptDiagnosticsCommand,
  buildToolUnavailableDiagnostics,
  getLanguageForPath,
  isEditFileDiagnostics,
};
