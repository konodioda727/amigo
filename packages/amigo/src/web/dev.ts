#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { buildWebApp, webOutdir } from "./buildWebApp";
import { startStaticWebServer } from "./staticServer";

const port = Number(process.env.PORT) || 3000;

if (existsSync(webOutdir)) {
  await rm(webOutdir, { recursive: true, force: true });
}

const initialResult = await buildWebApp({
  defineNodeEnv: "development",
  minify: false,
  sourcemap: "inline",
  watch: {
    onRebuild(result) {
      if (result.success) {
        console.log("[amigo-web] rebuilt");
        return;
      }

      console.error("[amigo-web] rebuild failed");
      for (const message of result.logs) {
        console.error(message);
      }
    },
  },
});

if (!initialResult.success) {
  throw new Error("Failed to build @amigo-llm/amigo web app for development");
}

const server = startStaticWebServer(webOutdir, port);

const stop = () => {
  server.stop(true);
  process.exit(0);
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
