import { describe, expect, it, mock } from "bun:test";
import type { ToolExecutionContext } from "@amigo-llm/types";
import { Bash } from "../bash";

const buildToolContext = (rawOutput: string): ToolExecutionContext =>
  ({
    taskId: "task-1",
    parentId: undefined,
    signal: undefined,
    postMessage: undefined,
    getToolByName: () => undefined,
    getSandbox: async () => ({
      isRunning: () => true,
      runCommand: mock(async () => rawOutput),
    }),
  }) as ToolExecutionContext;

describe("Bash", () => {
  it("keeps both the head and tail of long command output in the result message", async () => {
    const head = "H".repeat(2_000);
    const middle = "M".repeat(800);
    const tail = "T".repeat(1_000);
    const output = `${head}${middle}${tail}`;

    const result = await Bash.invoke({
      params: {
        command: "echo test",
      },
      context: buildToolContext(`${output}\nEXIT_CODE:1`),
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.output).toBe(output);
    expect(result.transport.message).toContain(head);
    expect(result.transport.message).toContain(tail);
    expect(result.transport.message).toContain("...(800 chars truncated)...");
    expect(result.transport.message).not.toContain(middle);
  });

  it("treats non-zero exits as completed command results", async () => {
    const result = await Bash.invoke({
      params: {
        command: "pnpm build",
      },
      context: buildToolContext("build failed\nEXIT_CODE:2"),
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.exitCode).toBe(2);
    expect(result.transport.result.output).toBe("build failed");
    expect(result.transport.message).toBe("命令执行已完成\n退出码: 2\n输出:\nbuild failed");
  });
});
