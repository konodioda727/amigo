#!/usr/bin/env bun
import { existsSync } from "node:fs";
import path from "node:path";
import { startStaticWebServer } from "./staticServer";

const port = Number(process.env.PORT) || 3000;
const webOutdir = path.join(process.cwd(), "dist", "web");
const entryFile = path.join(webOutdir, "index.html");

if (!existsSync(entryFile)) {
  throw new Error(`Missing built web assets at ${entryFile}. Run \`bun run build:web\` first.`);
}

startStaticWebServer(webOutdir, port);
