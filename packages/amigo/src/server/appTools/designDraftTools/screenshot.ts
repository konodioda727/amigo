import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { logger } from "@amigo-llm/backend";
import { createOssPostPolicy, getOssUploadConfig } from "../../utils/ossUpload";
import type { DraftRenderArtifact } from "./shared";
import { ensureDirectoryExists, getDraftRenderImagePath } from "./shared";

interface ScreenshotConfig {
  enabled: boolean;
  nodePath: string;
  browserPath: string;
  helperPath: string;
}

const DEFAULT_NODE_PATH = "/usr/bin/node";
let screenshotQueue: Promise<void> = Promise.resolve();

const runSerialScreenshotJob = async <T>(work: () => Promise<T>): Promise<T> => {
  const previous = screenshotQueue;
  let release: (() => void) | null = null;
  screenshotQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release?.();
  }
};

export const getScreenshotConfig = (): ScreenshotConfig | null => {
  if (process.env.AMIGO_SCREENSHOT_ENABLED !== "1") {
    return null;
  }

  const browserPath = (process.env.AMIGO_SCREENSHOT_BROWSER_PATH || "").trim();
  if (!browserPath) {
    return null;
  }

  const nodePath = (process.env.AMIGO_SCREENSHOT_NODE_PATH || DEFAULT_NODE_PATH).trim();
  const cwd = process.cwd();
  const helperPath = existsSync(
    path.resolve(cwd, "dist", "server", "scripts", "capture-preview-screenshot.mjs"),
  )
    ? path.resolve(cwd, "dist", "server", "scripts", "capture-preview-screenshot.mjs")
    : path.resolve(cwd, "scripts", "capture-preview-screenshot.mjs");

  return {
    enabled: true,
    nodePath,
    browserPath,
    helperPath,
  };
};

const uploadScreenshotIfPossible = async (filePath: string): Promise<string | null> => {
  const config = getOssUploadConfig();
  if (!config || !existsSync(filePath)) {
    return null;
  }

  const buffer = readFileSync(filePath);
  const policy = createOssPostPolicy(config, {
    fileName: path.basename(filePath),
    mimeType: "image/png",
    size: buffer.length,
  });
  const form = new FormData();
  for (const [key, value] of Object.entries(policy.formFields)) {
    form.set(key, value);
  }
  form.set("file", new Blob([buffer], { type: "image/png" }), path.basename(filePath));

  const response = await fetch(policy.uploadUrl, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `OSS 上传截图失败 (${response.status})`);
  }

  return policy.publicUrl;
};

const executeScreenshotHelper = async (params: {
  nodePath: string;
  helperPath: string;
  browserPath: string;
  htmlPath: string;
  outputPath: string;
  width: number;
  height: number;
}) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(
      params.nodePath,
      [
        params.helperPath,
        "--html",
        params.htmlPath,
        "--output",
        params.outputPath,
        "--browser",
        params.browserPath,
        "--width",
        String(params.width),
        "--height",
        String(params.height),
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `截图进程退出码 ${code}`));
    });
  });

export const captureDraftPreviewScreenshot = async (params: {
  taskId: string;
  draftId: string;
  revision: number;
  previewHtmlPath: string;
  deviceMode: "desktop" | "mobile";
}): Promise<DraftRenderArtifact> => {
  const config = getScreenshotConfig();
  if (!config) {
    return {
      draftId: params.draftId,
      revision: params.revision,
      deviceMode: params.deviceMode,
      status: "disabled",
      localFilePath: null,
      imagePath: null,
      publicImageUrl: null,
      capturedAt: null,
      message: "截图能力未启用或未配置浏览器路径",
    };
  }

  if (!existsSync(config.helperPath)) {
    return {
      draftId: params.draftId,
      revision: params.revision,
      deviceMode: params.deviceMode,
      status: "disabled",
      localFilePath: null,
      imagePath: null,
      publicImageUrl: null,
      capturedAt: null,
      message: `截图 helper 不存在: ${config.helperPath}`,
    };
  }

  const outputPath = getDraftRenderImagePath(params.taskId, params.draftId, params.revision);
  ensureDirectoryExists(path.dirname(outputPath));

  return runSerialScreenshotJob(async () => {
    try {
      await executeScreenshotHelper({
        nodePath: config.nodePath,
        helperPath: config.helperPath,
        browserPath: config.browserPath,
        htmlPath: params.previewHtmlPath,
        outputPath,
        width: params.deviceMode === "mobile" ? 390 : 1440,
        height: params.deviceMode === "mobile" ? 844 : 1600,
      });
      const publicImageUrl = await uploadScreenshotIfPossible(outputPath).catch((error) => {
        logger.warn("[DesignDraft] 上传截图到 OSS 失败", error);
        return null;
      });

      return {
        draftId: params.draftId,
        revision: params.revision,
        deviceMode: params.deviceMode,
        status: "captured",
        localFilePath: outputPath,
        imagePath: null,
        publicImageUrl,
        capturedAt: new Date().toISOString(),
        message: publicImageUrl ? "截图已生成并上传" : "截图已生成",
      } satisfies DraftRenderArtifact;
    } catch (error) {
      return {
        draftId: params.draftId,
        revision: params.revision,
        deviceMode: params.deviceMode,
        status: "failed",
        localFilePath: null,
        imagePath: null,
        publicImageUrl: null,
        capturedAt: null,
        message: error instanceof Error ? error.message : String(error),
      } satisfies DraftRenderArtifact;
    }
  });
};
