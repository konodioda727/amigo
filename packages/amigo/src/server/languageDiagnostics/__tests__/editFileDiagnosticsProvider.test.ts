import { describe, expect, it } from "bun:test";
import { __testing__, createEditFileDiagnosticsProvider } from "../editFileDiagnosticsProvider";

describe("editFileDiagnosticsProvider", () => {
  it("returns undefined for unsupported file extensions", async () => {
    const provider = createEditFileDiagnosticsProvider();
    const result = await provider({
      taskId: "task-1",
      filePath: "README.md",
      afterContent: "# readme",
      sandbox: {
        runCommand: async () => {
          throw new Error("should not run");
        },
      } as never,
    });

    expect(result).toBeUndefined();
  });

  it("builds a project-aware TypeScript diagnostics command", () => {
    const command = __testing__.buildTypeScriptDiagnosticsCommand("src/example.ts");

    expect(command).toContain("findConfigFile");
    expect(command).toContain("createProgram");
    expect(command).toContain("getPreEmitDiagnostics");
    expect(command).toContain("tsconfig.json");
  });

  it("builds a pyright-based Python diagnostics command", () => {
    const command = __testing__.buildPythonDiagnosticsCommand("app/example.py");

    expect(command).toContain("pyright");
    expect(command).toContain("--outputjson");
    expect(command).toContain("pyrightconfig.json");
    expect(command).toContain("pyproject.toml");
  });

  it("parses TypeScript diagnostics returned by the sandbox", async () => {
    const provider = createEditFileDiagnosticsProvider();
    let seenCommand = "";
    const result = await provider({
      taskId: "task-1",
      filePath: "src/example.ts",
      afterContent: "const value: string = 1",
      sandbox: {
        runCommand: async (command: string) => {
          seenCommand = command;
          return JSON.stringify({
            language: "typescript",
            status: "error",
            summary: "项目级 TypeScript 类型检查发现 1 个错误",
            errorCount: 1,
            diagnostics: [
              {
                source: "typescript",
                severity: "error",
                filePath: "src/example.ts",
                line: 1,
                column: 7,
                endLine: 1,
                endColumn: 12,
                code: "2322",
                message: "Type 'number' is not assignable to type 'string'.",
              },
            ],
          });
        },
      } as never,
    });

    expect(seenCommand).toContain("getPreEmitDiagnostics");
    expect(result?.language).toBe("typescript");
    expect(result?.errorCount).toBe(1);
  });

  it("parses Python diagnostics returned by pyright", async () => {
    const provider = createEditFileDiagnosticsProvider();
    let seenCommand = "";
    const result = await provider({
      taskId: "task-1",
      filePath: "app/example.py",
      afterContent: "import missing_pkg",
      sandbox: {
        runCommand: async (command: string) => {
          seenCommand = command;
          return JSON.stringify({
            language: "python",
            status: "error",
            summary: "项目级 Python 检查发现 1 个错误",
            errorCount: 1,
            diagnostics: [
              {
                source: "python",
                severity: "error",
                filePath: "app/example.py",
                line: 1,
                column: 8,
                endLine: 1,
                endColumn: 19,
                code: "reportMissingImports",
                message: 'Import "missing_pkg" could not be resolved',
              },
            ],
          });
        },
      } as never,
    });

    expect(seenCommand).toContain("pyright");
    expect(result?.language).toBe("python");
    expect(result?.errorCount).toBe(1);
  });
});
