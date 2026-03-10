#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { buildWebApp, webOutdir } from "./src/web/buildWebApp";

if (existsSync(webOutdir)) {
  await rm(webOutdir, { recursive: true, force: true });
}

const result = await buildWebApp({
  defineNodeEnv: "production",
  minify: true,
  sourcemap: "linked",
});

if (!result.success) {
  throw new Error("Failed to build @amigo-llm/amigo web app");
}
