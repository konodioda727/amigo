#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

const readFlag = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return "";
  }
  return process.argv[index + 1] || "";
};

const htmlPath = path.resolve(readFlag("--html"));
const outputPath = path.resolve(readFlag("--output"));
const browserPath = path.resolve(readFlag("--browser"));
const width = Number.parseInt(readFlag("--width") || "1440", 10);
const height = Number.parseInt(readFlag("--height") || "1600", 10);

if (!htmlPath || !outputPath || !browserPath) {
  console.error("Missing required flags: --html --output --browser");
  process.exit(1);
}

const main = async () => {
  const playwright = await import("playwright-core");
  const browser = await playwright.chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-zygote",
      "--single-process",
    ],
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: Number.isFinite(width) ? width : 1440,
        height: Number.isFinite(height) ? height : 1600,
      },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(htmlPath).toString(), {
      waitUntil: "load",
    });
    await page.waitForSelector("#amigo-design-flow-root", { timeout: 5000 });
    await page.screenshot({
      path: outputPath,
      type: "png",
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
