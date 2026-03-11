import { describe, expect, it } from "bun:test";
import { normalizeEditorOpenFilePath } from "./editorFilePath";

describe("normalizeEditorOpenFilePath", () => {
  it("maps relative repo paths into the sandbox workspace", () => {
    expect(normalizeEditorOpenFilePath("src/index.ts")).toBe("/sandbox/src/index.ts");
    expect(normalizeEditorOpenFilePath("./src/index.ts")).toBe("/sandbox/src/index.ts");
    expect(normalizeEditorOpenFilePath("sandbox/src/index.ts")).toBe("/sandbox/src/index.ts");
  });

  it("keeps sandbox-absolute paths stable", () => {
    expect(normalizeEditorOpenFilePath("/sandbox")).toBe("/sandbox");
    expect(normalizeEditorOpenFilePath("/sandbox/src/index.ts")).toBe("/sandbox/src/index.ts");
  });

  it("preserves non-sandbox absolute paths", () => {
    expect(normalizeEditorOpenFilePath("/tmp/example.log")).toBe("/tmp/example.log");
  });
});
