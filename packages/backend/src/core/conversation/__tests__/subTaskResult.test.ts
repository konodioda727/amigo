import { describe, expect, it } from "bun:test";
import type { ChatMessage } from "@amigo-llm/types";
import {
  extractCompletedSubTaskPayloadFromMessages,
  extractCompletedSubTaskResultFromMessages,
  formatCompletedSubTaskPayload,
  validateCompletedSubTaskPayload,
} from "../subTaskResult";

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
      } satisfies ChatMessage,
    ]);

    expect(result).toBe("设计稿已创建，pageId 为 home-page。");
  });

  it("extracts the full completeTask payload when present", () => {
    const payload = extractCompletedSubTaskPayloadFromMessages([
      {
        role: "assistant",
        type: "tool",
        partial: false,
        content: JSON.stringify({
          toolName: "completeTask",
          params: {
            summary: "首页设计稿已完成。",
            result:
              "## 交付物\n已生成页面。\n\n## 验证\n已核对结构。\n\n## 遗留问题\n无。\n\n## 下游说明\n可继续联调。",
            achievements: "新增 1 个页面",
            usage: "打开设计工具查看。",
          },
        }),
      } satisfies ChatMessage,
    ]);

    expect(payload).toEqual({
      summary: "首页设计稿已完成。",
      result:
        "## 交付物\n已生成页面。\n\n## 验证\n已核对结构。\n\n## 遗留问题\n无。\n\n## 下游说明\n可继续联调。",
      achievements: "新增 1 个页面",
      usage: "打开设计工具查看。",
    });
  });

  it("falls back to the latest assistant message when completeTask payload is missing", () => {
    const result = extractCompletedSubTaskResultFromMessages([
      {
        role: "assistant",
        type: "message",
        partial: false,
        content: "这里是最终说明",
      } satisfies ChatMessage,
    ]);

    expect(result).toBe("这里是最终说明");
  });

  it("formats full payload for dependency handoff", () => {
    const formatted = formatCompletedSubTaskPayload({
      summary: "首页设计稿已完成。",
      result:
        "## 交付物\n已生成页面。\n\n## 验证\n已核对结构。\n\n## 遗留问题\n无。\n\n## 下游说明\n可继续联调。",
      achievements: "新增 1 个页面",
      usage: "打开设计工具查看。",
    });

    expect(formatted).toContain("### 摘要");
    expect(formatted).toContain("## 交付物");
    expect(formatted).toContain("### 成果");
    expect(formatted).toContain("### 使用说明");
  });

  it("validates the required completeTask structure", () => {
    const validResult = validateCompletedSubTaskPayload({
      summary: "首页设计稿已完成。",
      result:
        "## 交付物\n已生成页面。\n\n## 验证\n已核对结构。\n\n## 遗留问题\n无。\n\n## 下游说明\n可继续联调。",
    });
    const invalidResult = validateCompletedSubTaskPayload({
      summary: "首页设计稿已完成。",
      result: "只有一段普通文本。",
    });

    expect(validResult.ok).toBe(true);
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.reason).toContain("未通过父任务自动验收");
    expect(invalidResult.details).toContain("result 缺少非空章节 `## 交付物`。");
  });
});
