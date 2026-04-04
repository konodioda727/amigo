import { describe, expect, it } from "bun:test";
import type { ToolExecutionContext } from "@amigo-llm/types";
import { ToolService } from "../index";
import { ReadFile } from "../readFile";

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

describe("ReadFile", () => {
  it("exposes filePaths as an array of strings in tool definitions", () => {
    const toolService = new ToolService([ReadFile], []);
    const definition = toolService.getToolDefinitions().find((tool) => tool.name === "readFile");

    expect(definition).toBeDefined();
    expect(definition?.parameters).toEqual({
      type: "object",
      properties: {
        filePaths: {
          type: "array",
          items: {
            type: "string",
            description: "单个要读取的文件路径",
          },
          description: "要读取的文件路径列表（支持相对于沙箱工作目录的路径或绝对路径）",
        },
        startLine: {
          type: "string",
          description: "可选：起始行号（从 1 开始）",
        },
        endLine: {
          type: "string",
          description: "可选：结束行号（包含）",
        },
      },
      required: ["filePaths"],
    });
  });

  it("reads a single absolute path from filePaths", async () => {
    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd.startsWith("test -f")) {
        return "exists";
      }
      if (cmd.startsWith("wc -l")) {
        return "2\n";
      }
      if (cmd.startsWith("cat ")) {
        return "alpha\nbeta\n";
      }
      return "";
    });

    const result = await ReadFile.invoke({
      params: { filePaths: ["/tmp/example.txt"] },
      context,
    });

    expect(result.toolResult.success).toBe(true);
    expect(result.toolResult.filePaths).toEqual(["/tmp/example.txt"]);
    expect(result.toolResult.files).toEqual([
      {
        success: true,
        content: "   1| alpha\n   2| beta",
        filePath: "/tmp/example.txt",
        message: "成功读取文件 /tmp/example.txt（全部内容，共 2 行）",
        totalLines: 2,
      },
    ]);
    expect(commands).toEqual([
      'test -f \'/tmp/example.txt\' && echo "exists" || echo "not_found"',
      "wc -l < '/tmp/example.txt'",
      "cat '/tmp/example.txt'",
    ]);
  });

  it("normalizes each relative path and returns mixed success for batch reads", async () => {
    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd === 'test -f \'src/index.ts\' && echo "exists" || echo "not_found"') {
        return "exists";
      }
      if (cmd === "wc -l < 'src/index.ts'") {
        return "1\n";
      }
      if (cmd === "cat 'src/index.ts'") {
        return "hello\n";
      }
      if (cmd === 'test -f \'/tmp/missing.txt\' && echo "exists" || echo "not_found"') {
        return "not_found";
      }
      return "";
    });

    const result = await ReadFile.invoke({
      params: { filePaths: ["./src/index.ts", "/tmp/missing.txt"] },
      context,
    });

    expect(result.toolResult.success).toBe(false);
    expect(result.toolResult.filePaths).toEqual(["src/index.ts", "/tmp/missing.txt"]);
    expect(result.toolResult.files).toEqual([
      {
        success: true,
        content: "   1| hello",
        filePath: "src/index.ts",
        message: "成功读取文件 src/index.ts（全部内容，共 1 行）",
        totalLines: 1,
      },
      {
        success: false,
        content: "",
        filePath: "/tmp/missing.txt",
        message: "文件不存在: /tmp/missing.txt",
      },
    ]);
    expect(commands).toEqual([
      'test -f \'src/index.ts\' && echo "exists" || echo "not_found"',
      "wc -l < 'src/index.ts'",
      "cat 'src/index.ts'",
      'test -f \'/tmp/missing.txt\' && echo "exists" || echo "not_found"',
    ]);
  });
});
