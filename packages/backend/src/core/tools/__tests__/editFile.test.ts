import { beforeEach, describe, expect, it } from "bun:test";
import type { ToolExecutionContext } from "@amigo-llm/types";
import { setGlobalState } from "@/globalState";
import { EditFile, normalizeEditFilePath } from "../editFile";

const createContext = (
  runCommand: (cmd: string) => Promise<string | undefined>,
): ToolExecutionContext => ({
  taskId: "task-1",
  getSandbox: async () => ({
    isRunning: () => true,
    runCommand,
  }),
  getToolByName: () => undefined,
});

describe("EditFile", () => {
  beforeEach(() => {
    setGlobalState("editFileDiagnosticsProvider", undefined);
  });

  it("preserves absolute paths when normalizing file paths", () => {
    expect(normalizeEditFilePath("/tmp/example.txt")).toBe("/tmp/example.txt");
    expect(normalizeEditFilePath("./src/index.ts")).toBe("src/index.ts");
  });

  it("writes to absolute paths without stripping the leading slash", async () => {
    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd === "mkdir -p '/tmp'") {
        return "";
      }
      if (cmd === `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`) {
        return commands.filter(
          (command) =>
            command === `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`,
        ).length === 1
          ? "not_found"
          : "exists";
      }
      if (cmd === "printf '%s' 'aGVsbG8=' | base64 -d > '/tmp/example.txt'") {
        return "";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.txt",
        content: "hello",
      },
      context,
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.filePath).toBe("/tmp/example.txt");
    expect(commands).toEqual([
      "mkdir -p '/tmp'",
      `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`,
      "printf '%s' 'aGVsbG8=' | base64 -d > '/tmp/example.txt'",
      `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`,
    ]);
  });

  it("patches an existing file by line range", async () => {
    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd === "mkdir -p '/tmp'") {
        return "";
      }
      if (cmd === `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`) {
        return "exists";
      }
      if (cmd === "cat '/tmp/example.txt'") {
        return "line1\nline2\nline3";
      }
      if (cmd === "printf '%s' 'bGluZTEKcmVwbGFjZWQKbGluZTM=' | base64 -d > '/tmp/example.txt'") {
        return "";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.txt",
        startLine: 2,
        endLine: 2,
        content: "replaced",
        expectedOriginalContent: "line2",
      },
      context,
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.linesWritten).toBe(1);
    expect(result.continuation.summary).toBe("【已修改 /tmp/example.txt】");
    expect(result.continuation.result.diagnostics).toBeUndefined();
    expect(commands).toEqual([
      "mkdir -p '/tmp'",
      `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`,
      "cat '/tmp/example.txt'",
      "printf '%s' 'bGluZTEKcmVwbGFjZWQKbGluZTM=' | base64 -d > '/tmp/example.txt'",
    ]);
  });

  it("rejects line patch requests without both line numbers", async () => {
    const context = createContext(async () => "");

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.txt",
        startLine: 2,
        content: "replaced",
      },
      context,
    });

    expect(result.transport.result.success).toBe(false);
    expect(result.transport.result.message).toBe("按行修改需要同时提供 startLine 和 endLine");
  });

  it("rejects line patch requests without expectedOriginalContent", async () => {
    const context = createContext(async () => "");

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.txt",
        startLine: 2,
        endLine: 2,
        content: "replaced",
      },
      context,
    });

    expect(result.transport.result.success).toBe(false);
    expect(result.transport.result.message).toBe(
      "按行修改需要提供 expectedOriginalContent，用于校验当前文件片段仍与读取时一致",
    );
  });

  it("rejects line patch requests when the original slice no longer matches", async () => {
    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd === "mkdir -p '/tmp'") {
        return "";
      }
      if (cmd === `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`) {
        return "exists";
      }
      if (cmd === "cat '/tmp/example.txt'") {
        return "line1\nline2 changed\nline3";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.txt",
        startLine: 2,
        endLine: 2,
        content: "replaced",
        expectedOriginalContent: "line2",
      },
      context,
    });

    expect(result.transport.result.success).toBe(false);
    expect(result.transport.result.message).toContain("按行修改前校验失败");
    expect(commands).toEqual([
      "mkdir -p '/tmp'",
      `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`,
      "cat '/tmp/example.txt'",
    ]);
  });

  it("replaces a uniquely matched string in an existing file", async () => {
    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd === "mkdir -p '/tmp'") {
        return "";
      }
      if (cmd === `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`) {
        return "exists";
      }
      if (cmd === "cat '/tmp/example.txt'") {
        return "line1\nline2\nline3";
      }
      if (cmd === "printf '%s' 'bGluZTEKcmVwbGFjZWQKbGluZTM=' | base64 -d > '/tmp/example.txt'") {
        return "";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.txt",
        oldString: "line2",
        newString: "replaced",
      },
      context,
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.linesWritten).toBe(1);
    expect(result.transport.result.message).toContain("成功精确替换文件");
    expect(result.continuation.summary).toBe("【已修改 /tmp/example.txt】");
    expect(commands).toEqual([
      "mkdir -p '/tmp'",
      `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`,
      "cat '/tmp/example.txt'",
      "printf '%s' 'bGluZTEKcmVwbGFjZWQKbGluZTM=' | base64 -d > '/tmp/example.txt'",
    ]);
  });

  it("rejects exact replacement when oldString matches multiple times", async () => {
    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd === "mkdir -p '/tmp'") {
        return "";
      }
      if (cmd === `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`) {
        return "exists";
      }
      if (cmd === "cat '/tmp/example.txt'") {
        return "line2\nline2\nline3";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.txt",
        oldString: "line2",
        newString: "replaced",
      },
      context,
    });

    expect(result.transport.result.success).toBe(false);
    expect(result.transport.result.message).toContain("命中 2 次");
    expect(commands).toEqual([
      "mkdir -p '/tmp'",
      `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`,
      "cat '/tmp/example.txt'",
    ]);
  });

  it("runs TypeScript syntax diagnostics after writing a ts file", async () => {
    setGlobalState("editFileDiagnosticsProvider", async ({ filePath }) => ({
      language: "typescript",
      status: "error",
      summary: "发现 1 个 TypeScript 语法错误",
      errorCount: 1,
      diagnostics: [
        {
          source: "typescript",
          severity: "error",
          filePath,
          line: 1,
          column: 7,
          endLine: 1,
          endColumn: 8,
          code: "1005",
          message: "'=' expected.",
        },
      ],
    }));

    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd === "mkdir -p '/tmp'") {
        return "";
      }
      if (cmd === `test -f '/tmp/example.ts' && echo "exists" || echo "not_found"`) {
        return commands.filter(
          (command) => command === `test -f '/tmp/example.ts' && echo "exists" || echo "not_found"`,
        ).length === 1
          ? "not_found"
          : "exists";
      }
      if (cmd === "printf '%s' 'Y29uc3QgPSAx' | base64 -d > '/tmp/example.ts'") {
        return "";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.ts",
        content: "const = 1",
      },
      context,
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.diagnostics?.language).toBe("typescript");
    expect(result.transport.result.diagnostics?.errorCount).toBe(1);
    expect(result.transport.message).toContain("发现 1 个 TypeScript 语法错误");
    expect(result.continuation.summary).toBe("【已修改 /tmp/example.ts】");
    expect(result.continuation.result.diagnostics).toBeUndefined();
  });

  it("runs Python syntax diagnostics after writing a py file", async () => {
    setGlobalState("editFileDiagnosticsProvider", async ({ filePath }) => ({
      language: "python",
      status: "error",
      summary: "发现 1 个 Python 语法错误",
      errorCount: 1,
      diagnostics: [
        {
          source: "python",
          severity: "error",
          filePath,
          line: 1,
          column: 7,
          endLine: 1,
          endColumn: 7,
          code: "SyntaxError",
          message: "'(' was never closed",
        },
      ],
    }));

    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd === "mkdir -p '/tmp'") {
        return "";
      }
      if (cmd === `test -f '/tmp/example.py' && echo "exists" || echo "not_found"`) {
        return commands.filter(
          (command) => command === `test -f '/tmp/example.py' && echo "exists" || echo "not_found"`,
        ).length === 1
          ? "not_found"
          : "exists";
      }
      if (cmd === "printf '%s' 'cHJpbnQo' | base64 -d > '/tmp/example.py'") {
        return "";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.py",
        content: "print(",
      },
      context,
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.diagnostics?.language).toBe("python");
    expect(result.transport.result.diagnostics?.errorCount).toBe(1);
    expect(result.transport.message).toContain("发现 1 个 Python 语法错误");
    expect(result.continuation.summary).toBe("【已修改 /tmp/example.py】");
    expect(result.continuation.result.diagnostics).toBeUndefined();
  });
});
