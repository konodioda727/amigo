import { describe, expect, it } from "bun:test";
import type { ToolExecutionContext } from "@amigo-llm/types";
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
  it("preserves absolute paths instead of stripping the leading slash", async () => {
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
      params: { filePath: "/tmp/example.txt" },
      context,
    });

    expect(result.toolResult.success).toBe(true);
    expect(result.toolResult.filePath).toBe("/tmp/example.txt");
    expect(commands).toEqual([
      'test -f \'/tmp/example.txt\' && echo "exists" || echo "not_found"',
      "wc -l < '/tmp/example.txt'",
      "cat '/tmp/example.txt'",
    ]);
  });

  it("still normalizes relative paths with a leading ./ prefix", async () => {
    const commands: string[] = [];
    const context = createContext(async (cmd) => {
      commands.push(cmd);
      if (cmd.startsWith("test -f")) {
        return "exists";
      }
      if (cmd.startsWith("wc -l")) {
        return "1\n";
      }
      if (cmd.startsWith("cat ")) {
        return "hello\n";
      }
      return "";
    });

    const result = await ReadFile.invoke({
      params: { filePath: "./src/index.ts" },
      context,
    });

    expect(result.toolResult.success).toBe(true);
    expect(result.toolResult.filePath).toBe("src/index.ts");
    expect(commands).toEqual([
      'test -f \'src/index.ts\' && echo "exists" || echo "not_found"',
      "wc -l < 'src/index.ts'",
      "cat 'src/index.ts'",
    ]);
  });
});
