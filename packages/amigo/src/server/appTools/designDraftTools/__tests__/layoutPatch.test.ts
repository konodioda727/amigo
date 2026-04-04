import { describe, expect, it } from "bun:test";
import { applyLayoutSourcePatch } from "../layoutTools";

describe("layout source patch", () => {
  it("replaces a line range", () => {
    const source = ["<section>", '  <div class="h-10 w-40 bg-zinc-800"></div>', "</section>"].join(
      "\n",
    );
    const result = applyLayoutSourcePatch({
      currentSource: source,
      startLine: 2,
      endLine: 2,
      content: '  <div class="h-12 w-48 rounded bg-zinc-900"></div>',
    });

    expect(result.errors).toEqual([]);
    expect(result.source).toContain("h-12 w-48");
    expect(result.source).not.toContain("h-10 w-40");
  });

  it("supports search replace", () => {
    const result = applyLayoutSourcePatch({
      currentSource: '<section data-module-id="hero" class="bg-zinc-100"></section>',
      search: "bg-zinc-100",
      replace: "bg-zinc-200",
    });

    expect(result.errors).toEqual([]);
    expect(result.source).toContain("bg-zinc-200");
  });
});
