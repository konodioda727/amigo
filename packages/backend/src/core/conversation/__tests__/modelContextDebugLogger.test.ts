import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setGlobalState } from "@/globalState";
import { extractCompletedSegments } from "../modelContextDebugLogger";

describe("modelContextDebugLogger", () => {
  afterEach(() => {
    setGlobalState("globalCachePath", undefined as never);
  });

  it("extracts completed multilingual sentence-like segments", () => {
    const text = "第一句。Second sentence! Third line\nFourth";
    const result = extractCompletedSegments(text, 0);

    expect(result.segments).toEqual(["第一句。", "Second sentence!", "Third line"]);
    expect(text.slice(result.nextIndex)).toBe("Fourth");
  });

  it("ignores empty trailing delimiters and preserves remaining text", () => {
    const text = "Alpha。\n\nBeta";
    const result = extractCompletedSegments(text, 0);

    expect(result.segments).toEqual(["Alpha。"]);
    expect(text.slice(result.nextIndex)).toBe("Beta");
  });

  it("can operate with a temp cache root", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-model-context-debug-"));
    setGlobalState("globalCachePath", tempRoot);

    const result = extractCompletedSegments("One. Two", 0);
    expect(result.segments).toEqual(["One."]);

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
