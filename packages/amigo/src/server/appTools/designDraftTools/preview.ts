import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FinalDesignDraft, LayoutOption, ModuleDraft } from "./shared";
import {
  AMIGO_PACKAGE_ROOT,
  ensureDirectoryExists,
  getFinalDraftBuildDirectoryPath,
  getFinalDraftDirectoryPath,
  getFinalDraftPreviewCssPath,
  getFinalDraftPreviewHtmlPath,
  getFinalDraftPreviewSourcePath,
  getFinalDraftSourcePath,
  getLayoutOptionBuildDirectoryPath,
  getLayoutOptionDirectoryPath,
  getLayoutOptionPreviewCssPath,
  getLayoutOptionPreviewHtmlPath,
  getLayoutOptionPreviewSourcePath,
  getLayoutOptionSourcePath,
  getModuleDraftBuildDirectoryPath,
  getModuleDraftPreviewCssPath,
  getModuleDraftPreviewHtmlPath,
  getModuleDraftPreviewSourcePath,
  normalizeId,
  toCssSpecifier,
} from "./shared";
import {
  readStoredFinalDesignDraft,
  readStoredLayoutOptions,
  readStoredModuleDraft,
  writeStoredFinalDesignDraftRecord,
} from "./storage";

const PREVIEW_VENDOR_DIR = path.resolve(AMIGO_PACKAGE_ROOT, "vendor");
const PREVIEW_TOKENS_PATH = path.join(PREVIEW_VENDOR_DIR, "tokens.css");
const PREVIEW_TAILWIND_ENTRY_PATH = path.resolve(
  AMIGO_PACKAGE_ROOT,
  "node_modules",
  "tailwindcss",
  "index.css",
);
const PREVIEW_TAILWIND_CLI_PATH = path.resolve(
  AMIGO_PACKAGE_ROOT,
  "node_modules",
  "@tailwindcss",
  "cli",
  "dist",
  "index.mjs",
);

const ensurePreviewRuntimeExists = () => {
  if (!existsSync(PREVIEW_TOKENS_PATH)) {
    throw new Error(`缺少预览 tokens 文件：${PREVIEW_TOKENS_PATH}`);
  }
  if (!existsSync(PREVIEW_TAILWIND_ENTRY_PATH)) {
    throw new Error(`缺少 Tailwind 运行时入口：${PREVIEW_TAILWIND_ENTRY_PATH}`);
  }
  if (!existsSync(PREVIEW_TAILWIND_CLI_PATH)) {
    throw new Error(
      `缺少 Tailwind CLI：${PREVIEW_TAILWIND_CLI_PATH}。请重新部署并执行 backend/deploy-amigo.sh`,
    );
  }
};

const buildPreviewCssSource = (props: {
  buildDir: string;
  sourcePath: string;
  bodyLines: string[];
}) =>
  [
    `@import "${toCssSpecifier(path.relative(props.buildDir, PREVIEW_TOKENS_PATH))}";`,
    `@import "${toCssSpecifier(path.relative(props.buildDir, PREVIEW_TAILWIND_ENTRY_PATH))}";`,
    `@source "${toCssSpecifier(path.relative(props.buildDir, props.sourcePath))}";`,
    "",
    ...props.bodyLines,
    "",
  ].join("\n");

const runTailwindCli = async (props: {
  inputPath: string;
  outputPath: string;
  cwd: string;
  errorMessage: string;
}) => {
  ensurePreviewRuntimeExists();

  const child = spawn(
    "node",
    [PREVIEW_TAILWIND_CLI_PATH, "-i", props.inputPath, "-o", props.outputPath, "--minify"],
    {
      cwd: props.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0 || !existsSync(props.outputPath)) {
    const details = Buffer.concat([...stdoutChunks, ...stderrChunks])
      .toString("utf-8")
      .trim();
    throw new Error(details ? `${props.errorMessage}\n${details}` : props.errorMessage);
  }
};

const buildPreviewDocument = (draft: FinalDesignDraft, cssText: string) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${draft.title}</title>
    <style>${cssText}</style>
  </head>
  <body class="min-h-screen bg-neutral-100 text-neutral-900 antialiased">
    <div id="amigo-design-flow-root">${draft.content}</div>
  </body>
</html>
`;

const buildLayoutOptionPreviewDocument = (option: LayoutOption, cssText: string) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${option.title}</title>
    <style>${cssText}</style>
  </head>
  <body class="min-h-screen bg-stone-100 text-neutral-900 antialiased">
    ${option.source}
  </body>
</html>
`;

const buildModuleDraftPreviewDocument = (draft: ModuleDraft, cssText: string) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${draft.title}</title>
    <style>${cssText}</style>
  </head>
  <body class="min-h-screen bg-stone-100 text-neutral-900 antialiased">
    <div class="mx-auto flex min-h-screen max-w-[1440px] items-start justify-center px-6 py-8">
      <div id="amigo-design-flow-root" class="w-full">${draft.html}</div>
    </div>
  </body>
</html>
`;

export const compileFinalDesignDraftPreview = async (
  taskId: string,
  draftId: string,
): Promise<{ previewHtmlPath: string; cssPath: string }> => {
  const normalizedDraftId = normalizeId(draftId);
  const draft = readStoredFinalDesignDraft(taskId, normalizedDraftId);
  if (!draft) {
    throw new Error(`未找到最终界面草稿 ${normalizedDraftId}`);
  }

  const draftDir = getFinalDraftDirectoryPath(taskId, normalizedDraftId);
  const buildDir = getFinalDraftBuildDirectoryPath(taskId, normalizedDraftId);
  ensureDirectoryExists(draftDir);
  ensureDirectoryExists(buildDir);

  const sourcePath = getFinalDraftSourcePath(taskId, normalizedDraftId);
  const previewSourcePath = getFinalDraftPreviewSourcePath(taskId, normalizedDraftId);
  const previewCssPath = getFinalDraftPreviewCssPath(taskId, normalizedDraftId);
  const previewHtmlPath = getFinalDraftPreviewHtmlPath(taskId, normalizedDraftId);

  writeFileSync(sourcePath, `${draft.content.trim()}\n`, "utf-8");
  writeFileSync(
    previewSourcePath,
    buildPreviewCssSource({
      buildDir,
      sourcePath,
      bodyLines: [
        ":root {",
        "  color-scheme: light;",
        "}",
        "",
        "body {",
        "  margin: 0;",
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
        "}",
        "",
        "#amigo-design-flow-root {",
        "  min-height: 100vh;",
        "}",
      ],
    }),
    "utf-8",
  );

  await runTailwindCli({
    inputPath: previewSourcePath,
    outputPath: previewCssPath,
    cwd: buildDir,
    errorMessage: "最终界面预览编译失败",
  });

  const cssText = readFileSync(previewCssPath, "utf-8");
  writeFileSync(previewHtmlPath, buildPreviewDocument(draft, cssText), "utf-8");

  return {
    previewHtmlPath,
    cssPath: previewCssPath,
  };
};

export const compileLayoutOptionPreview = async (
  taskId: string,
  layoutId: string,
): Promise<{ previewHtmlPath: string; cssPath: string }> => {
  const normalizedLayoutId = normalizeId(layoutId);
  const option = readStoredLayoutOptions(taskId).find(
    (item) => item.layoutId === normalizedLayoutId,
  );
  if (!option) {
    throw new Error(`未找到布局方案 ${normalizedLayoutId}`);
  }

  const optionDir = getLayoutOptionDirectoryPath(taskId, normalizedLayoutId);
  const buildDir = getLayoutOptionBuildDirectoryPath(taskId, normalizedLayoutId);
  ensureDirectoryExists(optionDir);
  ensureDirectoryExists(buildDir);

  const sourcePath = getLayoutOptionSourcePath(taskId, normalizedLayoutId);
  const previewSourcePath = getLayoutOptionPreviewSourcePath(taskId, normalizedLayoutId);
  const previewCssPath = getLayoutOptionPreviewCssPath(taskId, normalizedLayoutId);
  const previewHtmlPath = getLayoutOptionPreviewHtmlPath(taskId, normalizedLayoutId);

  writeFileSync(sourcePath, `${option.source.trim()}\n`, "utf-8");
  writeFileSync(
    previewSourcePath,
    buildPreviewCssSource({
      buildDir,
      sourcePath,
      bodyLines: [
        ":root {",
        "  color-scheme: light;",
        "}",
        "",
        "body {",
        "  margin: 0;",
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
        "}",
        "",
        "[data-module-id] {",
        "  position: relative;",
        "  outline: 1px dashed rgba(15, 23, 42, 0.18);",
        "  outline-offset: -1px;",
        "}",
        "",
        "[data-module-id]::before {",
        "  content: attr(data-module-id);",
        "  position: absolute;",
        "  top: 8px;",
        "  left: 8px;",
        "  z-index: 10;",
        "  border-radius: 999px;",
        "  background: rgba(15, 23, 42, 0.92);",
        "  color: white;",
        "  padding: 4px 10px;",
        "  font-size: 12px;",
        "  font-weight: 600;",
        "  line-height: 1;",
        "}",
        "",
        "[data-slot] {",
        "  border-radius: 14px;",
        "  border: 1px dashed rgba(100, 116, 139, 0.42);",
        "  background: rgba(255, 255, 255, 0.72);",
        "}",
      ],
    }),
    "utf-8",
  );

  await runTailwindCli({
    inputPath: previewSourcePath,
    outputPath: previewCssPath,
    cwd: buildDir,
    errorMessage: "布局骨架预览编译失败",
  });

  const cssText = readFileSync(previewCssPath, "utf-8");
  writeFileSync(previewHtmlPath, buildLayoutOptionPreviewDocument(option, cssText), "utf-8");

  return {
    previewHtmlPath,
    cssPath: previewCssPath,
  };
};

export const compileModuleDraftPreview = async (
  taskId: string,
  draftId: string,
  moduleId: string,
): Promise<{ previewHtmlPath: string; cssPath: string }> => {
  const normalizedDraftId = normalizeId(draftId);
  const normalizedModuleId = normalizeId(moduleId);
  const draft = readStoredModuleDraft(taskId, normalizedDraftId, normalizedModuleId);
  if (!draft) {
    throw new Error(`未找到模块草稿 ${normalizedModuleId}`);
  }

  const buildDir = getModuleDraftBuildDirectoryPath(taskId, normalizedDraftId, normalizedModuleId);
  ensureDirectoryExists(buildDir);
  ensureDirectoryExists(
    path.dirname(getModuleDraftPreviewHtmlPath(taskId, normalizedDraftId, normalizedModuleId)),
  );

  const sourcePath = path.join(buildDir, "module-source.html");
  const previewSourcePath = getModuleDraftPreviewSourcePath(
    taskId,
    normalizedDraftId,
    normalizedModuleId,
  );
  const previewCssPath = getModuleDraftPreviewCssPath(
    taskId,
    normalizedDraftId,
    normalizedModuleId,
  );
  const previewHtmlPath = getModuleDraftPreviewHtmlPath(
    taskId,
    normalizedDraftId,
    normalizedModuleId,
  );

  writeFileSync(sourcePath, `${draft.html.trim()}\n`, "utf-8");
  writeFileSync(
    previewSourcePath,
    buildPreviewCssSource({
      buildDir,
      sourcePath,
      bodyLines: [
        ":root {",
        "  color-scheme: light;",
        "}",
        "",
        "body {",
        "  margin: 0;",
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
        "}",
        "",
        "#amigo-design-flow-root {",
        "  width: 100%;",
        "}",
        "",
        "[data-module-id] {",
        "  position: relative;",
        "}",
        "",
        "[data-module-id]::before {",
        "  content: attr(data-module-id);",
        "  position: absolute;",
        "  top: 12px;",
        "  left: 12px;",
        "  z-index: 10;",
        "  border-radius: 999px;",
        "  background: rgba(15, 23, 42, 0.92);",
        "  color: white;",
        "  padding: 4px 10px;",
        "  font-size: 12px;",
        "  font-weight: 600;",
        "  line-height: 1;",
        "}",
      ],
    }),
    "utf-8",
  );

  await runTailwindCli({
    inputPath: previewSourcePath,
    outputPath: previewCssPath,
    cwd: buildDir,
    errorMessage: "模块预览编译失败",
  });

  const cssText = readFileSync(previewCssPath, "utf-8");
  writeFileSync(previewHtmlPath, buildModuleDraftPreviewDocument(draft, cssText), "utf-8");

  return {
    previewHtmlPath,
    cssPath: previewCssPath,
  };
};

export const upsertStoredFinalDesignDraft = async (
  taskId: string,
  input: {
    draftId: string;
    title: string;
    content: string;
    basedOnLayoutId: string;
    basedOnThemeId: string;
    notes?: string | null;
    status?: "draft" | "approved";
  },
): Promise<FinalDesignDraft> => {
  const normalizedDraftId = normalizeId(input.draftId);
  const existing = readStoredFinalDesignDraft(taskId, normalizedDraftId);
  const now = new Date().toISOString();
  const nextRecord: FinalDesignDraft = {
    draftId: normalizedDraftId,
    title: input.title.trim() || existing?.title || normalizedDraftId,
    notes: typeof input.notes === "string" ? input.notes.trim() || null : existing?.notes || null,
    content: input.content.trim(),
    basedOnLayoutId: normalizeId(input.basedOnLayoutId),
    basedOnThemeId: normalizeId(input.basedOnThemeId),
    status: input.status === "approved" ? "approved" : existing?.status || "draft",
    revision: (existing?.revision || 0) + 1,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  writeStoredFinalDesignDraftRecord(taskId, nextRecord);
  await compileFinalDesignDraftPreview(taskId, normalizedDraftId);
  return nextRecord;
};

export const readCompiledFinalDesignDraftPreview = async (
  taskId: string,
  draftId: string,
): Promise<string> => {
  const normalizedDraftId = normalizeId(draftId);
  const previewHtmlPath = getFinalDraftPreviewHtmlPath(taskId, normalizedDraftId);
  if (!existsSync(previewHtmlPath)) {
    await compileFinalDesignDraftPreview(taskId, normalizedDraftId);
  }

  return readFileSync(previewHtmlPath, "utf-8");
};

export const readCompiledLayoutOptionPreview = async (
  taskId: string,
  layoutId: string,
): Promise<string> => {
  const normalizedLayoutId = normalizeId(layoutId);
  const previewHtmlPath = getLayoutOptionPreviewHtmlPath(taskId, normalizedLayoutId);
  if (!existsSync(previewHtmlPath)) {
    await compileLayoutOptionPreview(taskId, normalizedLayoutId);
  }

  return readFileSync(previewHtmlPath, "utf-8");
};

export const readCompiledModuleDraftPreview = async (
  taskId: string,
  draftId: string,
  moduleId: string,
): Promise<string> => {
  const normalizedDraftId = normalizeId(draftId);
  const normalizedModuleId = normalizeId(moduleId);
  const previewHtmlPath = getModuleDraftPreviewHtmlPath(
    taskId,
    normalizedDraftId,
    normalizedModuleId,
  );
  if (!existsSync(previewHtmlPath)) {
    await compileModuleDraftPreview(taskId, normalizedDraftId, normalizedModuleId);
  }

  return readFileSync(previewHtmlPath, "utf-8");
};
