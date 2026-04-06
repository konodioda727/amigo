import { describe, expect, it, mock } from "bun:test";
import { createEditFileDiagnosticsProvider } from "../editFileDiagnosticsProvider";

describe("editFileDiagnosticsProvider", () => {
  it("returns undefined for unsupported file extensions", async () => {
    const service = {
      getDiagnostics: mock(async () => {
        throw new Error("should not run");
      }),
    };
    const provider = createEditFileDiagnosticsProvider(service as never);

    const result = await provider({
      taskId: "task-1",
      filePath: "README.md",
      afterContent: "# readme",
      sandbox: {} as never,
    });

    expect(result).toBeUndefined();
    expect(service.getDiagnostics).not.toHaveBeenCalled();
  });

  it("forwards editFile payload into the language intelligence service", async () => {
    const service = {
      getDiagnostics: mock(async () => ({
        language: "typescript" as const,
        status: "error" as const,
        summary: "TypeScript LSP 诊断发现 1 个错误",
        errorCount: 1,
        diagnostics: [],
      })),
    };
    const provider = createEditFileDiagnosticsProvider(service as never);

    const result = await provider({
      taskId: "task-1",
      parentId: "parent-1",
      conversationContext: { repoUrl: "https://example.com/repo.git" },
      filePath: "src/example.ts",
      afterContent: "const value: string = 1",
      sandbox: {} as never,
    });

    expect(service.getDiagnostics).toHaveBeenCalledWith({
      taskId: "parent-1",
      filePath: "src/example.ts",
      content: "const value: string = 1",
      conversationContext: { repoUrl: "https://example.com/repo.git" },
      sandbox: {},
    });
    expect(result?.language).toBe("typescript");
    expect(result?.errorCount).toBe(1);
  });
});
