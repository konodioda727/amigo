import { describe, expect, it } from "bun:test";
import { __testing__, LanguageIntelligenceService } from "../languageIntelligenceService";

describe("LanguageIntelligenceService", () => {
  it("returns undefined for unsupported file extensions", async () => {
    const service = new LanguageIntelligenceService({
      readLspConfig: () => undefined,
    });

    const result = await service.getDiagnostics({
      taskId: "task-1",
      filePath: "README.md",
      content: "# readme",
    });

    expect(result).toBeUndefined();
  });

  it("returns tool_unavailable when no matching LSP server is configured", async () => {
    const service = new LanguageIntelligenceService({
      readLspConfig: () => ({
        servers: [],
      }),
    });

    const result = await service.getDiagnostics({
      taskId: "task-1",
      filePath: "src/example.ts",
      content: "const value: string = 1",
    });

    expect(result?.language).toBe("typescript");
    expect(result?.status).toBe("tool_unavailable");
  });

  it("resolves the nearest exact symbol anchor on the same line", () => {
    const anchor = __testing__.resolveSymbolAnchor({
      content: [
        "const unrelatedValue = 1;",
        "const target = factory(targetValue, target);",
        "console.log(target);",
      ].join("\n"),
      symbolName: "target",
      line: 2,
      column: 37,
      maxLineDistance: 6,
    });

    expect(anchor).toEqual({
      symbolName: "target",
      line: 2,
      column: 37,
      endLine: 2,
      endColumn: 43,
      preview: "const target = factory(targetValue, target);",
    });
  });

  it("does not match symbol substrings inside larger identifiers", () => {
    const anchor = __testing__.resolveSymbolAnchor({
      content: [
        "const targetValue = 1;",
        "const target_value = 2;",
        "const other = targetValue + target_value;",
      ].join("\n"),
      symbolName: "target",
      line: 2,
      column: 8,
      maxLineDistance: 6,
    });

    expect(anchor).toBeUndefined();
  });

  it("returns a failed lookup when the nearby symbol cannot be anchored", async () => {
    const service = new LanguageIntelligenceService({
      readLspConfig: () => ({
        servers: [
          {
            id: "ts",
            languageIds: ["typescript"],
            fileExtensions: [".ts"],
            command: ["typescript-language-server", "--stdio"],
          },
        ],
      }),
      readLanguageRuntimeHostManager: () => ({
        getOrCreate: () => ({
          id: "task-1",
          cwd: "/workspace",
          runCommand: async (cmd: string) =>
            cmd.includes("cat ") ? "const actualSymbol = 1;\nconsole.log(actualSymbol);\n" : "",
          spawnStdioProcess: async () => {
            throw new Error("should not start lsp when anchor resolution fails");
          },
        }),
      }),
    });

    const result = await service.goToDefinition({
      taskId: "task-1",
      filePath: "src/example.ts",
      symbolName: "missingSymbol",
      line: 1,
      column: 7,
    });

    expect(result.success).toBeFalse();
    expect(result.locations).toEqual([]);
    expect(result.message).toContain("missingSymbol");
  });
});
