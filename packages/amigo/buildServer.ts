#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const distDir = path.resolve("dist");
const serverOutdir = path.join(distDir, "server");
const dataOutdir = path.join(distDir, "data");
const scriptsOutdir = path.join(serverOutdir, "scripts");
const backendPromptRoot = path.resolve("..", "backend", "src", "core", "systemPrompt");
const screenshotHelperScriptPath = path.resolve("scripts", "capture-preview-screenshot.mjs");

if (existsSync(serverOutdir)) {
  await rm(serverOutdir, { recursive: true, force: true });
}

if (existsSync(dataOutdir)) {
  await rm(dataOutdir, { recursive: true, force: true });
}

const buildProcess = Bun.spawn(
  ["bun", "build", "./src/server/index.ts", "--outdir", "./dist/server", "--target=bun"],
  {
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
  },
);

const exitCode = await buildProcess.exited;
if (exitCode !== 0) {
  throw new Error(`Failed to build @amigo-llm/amigo server bundle (exit ${exitCode})`);
}

const cssTreePackageJsonPath = require.resolve("css-tree/package.json");
const cssTreeRoot = path.dirname(cssTreePackageJsonPath);
const patchJsonPath = path.join(cssTreeRoot, "data", "patch.json");

await mkdir(dataOutdir, { recursive: true });
await cp(patchJsonPath, path.join(dataOutdir, "patch.json"));
await cp(path.join(backendPromptRoot, "main"), path.join(serverOutdir, "main"), {
  recursive: true,
});
await cp(path.join(backendPromptRoot, "shared"), path.join(serverOutdir, "shared"), {
  recursive: true,
});
await cp(path.join(backendPromptRoot, "sub"), path.join(serverOutdir, "sub"), { recursive: true });
await mkdir(scriptsOutdir, { recursive: true });
if (existsSync(screenshotHelperScriptPath)) {
  await cp(screenshotHelperScriptPath, path.join(scriptsOutdir, "capture-preview-screenshot.mjs"));
}
