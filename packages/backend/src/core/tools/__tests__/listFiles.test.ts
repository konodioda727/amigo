import { describe, expect, it } from "bun:test";
import type { ToolExecutionContext } from "@amigo-llm/types";
import { ToolService } from "../index";
import { ListFiles } from "../listFiles";

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

describe("ListFiles", () => {
  it("exposes directory listing params in tool definitions", () => {
    const toolService = new ToolService([ListFiles], []);
    const definition = toolService.getToolDefinitions().find((tool) => tool.name === "listFiles");

    expect(definition).toBeDefined();
    expect(definition?.parameters).toEqual({
      type: "object",
      properties: {
        directoryPath: {
          type: "string",
          description:
            "可选：要列出的目录路径；支持相对于沙箱工作目录的路径或绝对路径，默认当前目录",
        },
        maxDepth: {
          type: "string",
          description: "可选：最大递归深度，1 表示仅列出直接子项，默认 2",
        },
        includeHidden: {
          type: "string",
          description: "可选：是否包含隐藏文件和隐藏目录，默认 false",
        },
        maxEntries: {
          type: "string",
          description: "可选：最多返回多少条结果，默认 200，最大 500",
        },
      },
    });
  });

  it("lists directory entries and preserves a short continuation summary", async () => {
    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd === `test -d 'src' && echo "exists" || echo "not_found"`) {
        return "exists";
      }
      if (cmd.includes("find 'src'")) {
        return ["directory\tsrc/components", "file\tsrc/index.ts", ""].join("\n");
      }
      return "";
    });

    const result = await ListFiles.invoke({
      params: { directoryPath: "./src", maxDepth: 2 },
      context,
    });

    expect(result.transport.result).toEqual({
      success: true,
      directoryPath: "src",
      tree: ["src/", "├── components/", "└── index.ts"].join("\n"),
      entries: [
        {
          path: "src/components",
          name: "components",
          type: "directory",
          depth: 1,
        },
        {
          path: "src/index.ts",
          name: "index.ts",
          type: "file",
          depth: 1,
        },
      ],
      truncated: false,
      maxDepth: 2,
      includeHidden: false,
      maxEntries: 200,
      message: "已列出目录 src，共 2 项",
    });
    expect(result.continuation.summary).toBe("【已列出 src】");
    expect(commands[0]).toBe(`test -d 'src' && echo "exists" || echo "not_found"`);
    expect(commands[1]).toContain(`find 'src' -maxdepth 2`);
    expect(commands[1]).toContain("head -n 201");
  });

  it("marks results as truncated when output exceeds maxEntries", async () => {
    const context = createContext(async (cmd) => {
      if (cmd.startsWith("test -d")) {
        return "exists";
      }
      if (cmd.includes("find 'src'")) {
        return ["file\tsrc/a.ts", "file\tsrc/b.ts", "file\tsrc/c.ts", ""].join("\n");
      }
      return "";
    });

    const result = await ListFiles.invoke({
      params: { directoryPath: "src", maxEntries: 2 },
      context,
    });

    expect(result.transport.result.entries).toHaveLength(2);
    expect(result.transport.result.tree).toBe(["src/", "├── a.ts", "└── b.ts"].join("\n"));
    expect(result.transport.result.truncated).toBe(true);
    expect(result.transport.result.message).toBe("已列出目录 src 的前 2 项（结果已截断）");
  });
});
