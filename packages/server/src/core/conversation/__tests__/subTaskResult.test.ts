import { describe, expect, it } from "bun:test";
import { extractCompletedSubTaskResultFromMessages } from "../subTaskResult";

describe("extractCompletedSubTaskResultFromMessages", () => {
  it("returns completeTask result when present", () => {
    const result = extractCompletedSubTaskResultFromMessages([
      {
        role: "assistant",
        type: "tool",
        partial: false,
        content: JSON.stringify({
          toolName: "completeTask",
          params: {
            result: "设计稿已创建，pageId 为 home-page。",
          },
        }),
      } as any,
    ]);

    expect(result).toBe("设计稿已创建，pageId 为 home-page。");
  });

  it("falls back to the latest assistant message when completeTask payload is missing", () => {
    const result = extractCompletedSubTaskResultFromMessages([
      {
        role: "assistant",
        type: "message",
        partial: false,
        content: "这里是最终说明",
      } as any,
    ]);

    expect(result).toBe("这里是最终说明");
  });
});
