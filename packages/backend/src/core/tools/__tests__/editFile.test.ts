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

const writeCommand = (filePath: string, content: string) =>
  `printf '%s' '${Buffer.from(content, "utf-8").toString("base64")}' | base64 -d > '${filePath}'`;

describe("EditFile", () => {
  beforeEach(() => {
    setGlobalState("editFileDiagnosticsProvider", undefined);
  });

  it("nudges incremental edits before bulk edits in tool guidance", () => {
    expect(EditFile.whenToUse).toContain("先改这一处");
    expect(EditFile.whenToUse).toContain("不要为了凑批量修改而继续阅读其他文件");
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
        newString: "hello",
      },
      context,
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.filePath).toBe("/tmp/example.txt");
    expect(commands).toEqual([
      "mkdir -p '/tmp'",
      `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`,
      "printf '%s' 'aGVsbG8=' | base64 -d > '/tmp/example.txt'",
    ]);
  });

  it("uses startLine hints to disambiguate exact replacement", async () => {
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
        return "line1\nline2\nline3\nline2";
      }
      if (cmd === writeCommand("/tmp/example.txt", "line1\nline2\nline3\nreplaced")) {
        return "";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.txt",
        oldString: "line2",
        newString: "replaced",
        startLine: 4,
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
      writeCommand("/tmp/example.txt", "line1\nline2\nline3\nreplaced"),
    ]);
  });

  it("rejects line-style edits without oldString/newString", async () => {
    const context = createContext(async () => "");

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.txt",
        startLine: 2,
        newString: "replaced",
      },
      context,
    });

    expect(result.transport.result.success).toBe(false);
    expect(result.transport.result.status).toBe("failed");
    expect(result.transport.result.message).toBe(
      "editFile 不再支持按行替换。若只传 newString，则表示整文件写入；局部修改请同时提供 oldString/newString。",
    );
  });

  it("rejects expectedOriginalContent because line replacement is no longer supported", async () => {
    const context = createContext(async () => "");

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.txt",
        startLine: 2,
        oldString: "line2",
        newString: "replaced",
        expectedOriginalContent: "line2",
      },
      context,
    });

    expect(result.transport.result.success).toBe(false);
    expect(result.transport.result.status).toBe("failed");
    expect(result.transport.result.message).toBe(
      "editFile 不再支持 expectedOriginalContent。局部修改请使用 oldString/newString，startLine/endLine 仅作 oldString 的定位提示。",
    );
  });

  it("rejects ambiguous replacements even when startLine is too broad", async () => {
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
        return "line2\nmiddle\nline2";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        filePath: "/tmp/example.txt",
        startLine: 2,
        oldString: "line2",
        newString: "replaced",
      },
      context,
    });

    expect(result.transport.result.success).toBe(false);
    expect(result.transport.result.status).toBe("failed");
    expect(result.transport.result.message).toContain("同等接近");
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
    expect(result.transport.result.status).toBe("success");
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
    expect(result.transport.result.status).toBe("failed");
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
        newString: "const = 1",
      },
      context,
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.status).toBe("success");
    expect(result.transport.result.diagnostics?.language).toBe("typescript");
    expect(result.transport.result.diagnostics?.errorCount).toBe(1);
    expect(result.transport.message).toContain("发现 1 个 TypeScript 语法错误");
    expect(result.continuation.summary).toBe("【已修改 /tmp/example.ts】");
    expect(result.continuation.result.diagnostics?.language).toBe("typescript");
    expect(result.continuation.result.diagnostics?.errorCount).toBe(1);
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
        newString: "print(",
      },
      context,
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.status).toBe("success");
    expect(result.transport.result.diagnostics?.language).toBe("python");
    expect(result.transport.result.diagnostics?.errorCount).toBe(1);
    expect(result.transport.message).toContain("发现 1 个 Python 语法错误");
    expect(result.continuation.summary).toBe("【已修改 /tmp/example.py】");
    expect(result.continuation.result.diagnostics?.language).toBe("python");
    expect(result.continuation.result.diagnostics?.errorCount).toBe(1);
  });

  it("supports multiple sequential edits within the same file in one call", async () => {
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
        return "alpha\nbeta\ngamma";
      }
      if (cmd === "printf '%s' 'QUxQSEEKYmV0YS0yCkdhbW1h' | base64 -d > '/tmp/example.txt'") {
        return "";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        edits: [
          {
            filePath: "/tmp/example.txt",
            oldString: "alpha",
            newString: "ALPHA",
          },
          {
            filePath: "/tmp/example.txt",
            oldString: "beta\ngamma",
            newString: "beta-2\nGamma",
            startLine: 2,
            endLine: 3,
          },
        ],
      },
      context,
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.status).toBe("success");
    expect(result.transport.result.filePath).toBe("/tmp/example.txt");
    expect(result.transport.result.linesWritten).toBe(3);
    expect(result.transport.result.message).toContain("共 2 处编辑");
    expect(commands).toEqual([
      "mkdir -p '/tmp'",
      `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`,
      "cat '/tmp/example.txt'",
      "printf '%s' 'QUxQSEEKYmV0YS0yCkdhbW1h' | base64 -d > '/tmp/example.txt'",
    ]);
  });

  it("supports batch edits across multiple files in one call", async () => {
    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd === "mkdir -p '/tmp'") {
        return "";
      }
      if (cmd === `test -f '/tmp/one.txt' && echo "exists" || echo "not_found"`) {
        return "exists";
      }
      if (cmd === "cat '/tmp/one.txt'") {
        return "hello\nworld";
      }
      if (cmd === "printf '%s' 'aGVsbG8KYW1pZ28=' | base64 -d > '/tmp/one.txt'") {
        return "";
      }
      if (cmd === `test -f '/tmp/two.txt' && echo "exists" || echo "not_found"`) {
        return "not_found";
      }
      if (cmd === "printf '%s' 'bmV3CmZpbGU=' | base64 -d > '/tmp/two.txt'") {
        return "";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        edits: [
          {
            filePath: "/tmp/one.txt",
            oldString: "world",
            newString: "amigo",
          },
          {
            filePath: "/tmp/two.txt",
            newString: "new\nfile",
          },
        ],
      },
      context,
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.status).toBe("success");
    expect(result.transport.result.filePath).toBeUndefined();
    expect(result.transport.result.edits).toHaveLength(2);
    expect(result.transport.result.message).toContain("成功批量修改 2 个文件");
    expect(result.continuation.summary).toBe("【已批量修改 2 个文件】");
    expect(commands).toEqual([
      "mkdir -p '/tmp'",
      `test -f '/tmp/one.txt' && echo "exists" || echo "not_found"`,
      "cat '/tmp/one.txt'",
      "printf '%s' 'aGVsbG8KYW1pZ28=' | base64 -d > '/tmp/one.txt'",
      "mkdir -p '/tmp'",
      `test -f '/tmp/two.txt' && echo "exists" || echo "not_found"`,
      "printf '%s' 'bmV3CmZpbGU=' | base64 -d > '/tmp/two.txt'",
    ]);
  });

  it("keeps successful files applied and reports failed files clearly in batch mode", async () => {
    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd === "mkdir -p '/tmp'") {
        return "";
      }
      if (cmd === `test -f '/tmp/one.txt' && echo "exists" || echo "not_found"`) {
        return "exists";
      }
      if (cmd === "cat '/tmp/one.txt'") {
        return "hello\nworld";
      }
      if (cmd === "printf '%s' 'aGVsbG8KYW1pZ28=' | base64 -d > '/tmp/one.txt'") {
        return "";
      }
      if (cmd === `test -f '/tmp/two.txt' && echo "exists" || echo "not_found"`) {
        return "exists";
      }
      if (cmd === "cat '/tmp/two.txt'") {
        return "same\ncontent";
      }
      return "";
    });

    const result = await EditFile.invoke({
      params: {
        edits: [
          {
            filePath: "/tmp/one.txt",
            oldString: "world",
            newString: "amigo",
          },
          {
            filePath: "/tmp/two.txt",
            oldString: "missing",
            newString: "changed",
          },
        ],
      },
      context,
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.status).toBe("partial_success");
    expect(result.transport.result.message).toContain("成功 1 个，失败 1 个");
    expect(result.transport.result.message).toContain("/tmp/two.txt");
    expect(result.transport.result.edits).toHaveLength(2);
    expect(result.transport.result.edits?.[0]).toMatchObject({
      success: true,
      filePath: "/tmp/one.txt",
    });
    expect(result.transport.result.edits?.[1]).toMatchObject({
      success: false,
      filePath: "/tmp/two.txt",
    });
    expect(result.transport.result.edits?.[1]?.failureReason).toContain("oldString 未在文件中命中");
    expect(result.continuation.summary).toBe("【批量编辑：成功 1 个，失败 1 个】");
    expect(commands).toEqual([
      "mkdir -p '/tmp'",
      `test -f '/tmp/one.txt' && echo "exists" || echo "not_found"`,
      "cat '/tmp/one.txt'",
      "printf '%s' 'aGVsbG8KYW1pZ28=' | base64 -d > '/tmp/one.txt'",
      "mkdir -p '/tmp'",
      `test -f '/tmp/two.txt' && echo "exists" || echo "not_found"`,
      "cat '/tmp/two.txt'",
    ]);
  });
});
