import { describe, expect, it } from "bun:test";
import type { ToolExecutionContext } from "@amigo-llm/types";
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
        mode: "overwrite",
      },
      context,
    });

    expect(result.toolResult.success).toBe(true);
    expect(result.toolResult.filePath).toBe("/tmp/example.txt");
    expect(commands).toEqual([
      "mkdir -p '/tmp'",
      `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`,
      "printf '%s' 'aGVsbG8=' | base64 -d > '/tmp/example.txt'",
      `test -f '/tmp/example.txt' && echo "exists" || echo "not_found"`,
    ]);
  });
});
