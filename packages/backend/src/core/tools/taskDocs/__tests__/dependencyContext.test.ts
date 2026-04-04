import { describe, expect, it } from "bun:test";
import type { ChatMessage } from "@amigo-llm/types";
import { buildDependencyResultContext } from "../dependencyContext";

describe("buildDependencyResultContext", () => {
  it("injects completeTask results for declared dependencies", () => {
    const dependencyConversation = {
      memory: {
        messages: [
          {
            role: "assistant",
            type: "tool",
            partial: false,
            content: JSON.stringify({
              toolName: "completeTask",
              params: {
                summary: "首页设计稿已完成。",
                result: "已完成首页设计稿，pageId=home-page。",
                usage: "可直接用于下游切图。",
              },
            }),
          } satisfies ChatMessage,
        ],
      },
    };

    const context = buildDependencyResultContext({
      dependencies: ["1.1"],
      parentConversation: {
        memory: {
          subTasks: {
            "1.1": {
              subTaskId: "sub-1",
            },
          },
        },
      },
      loadConversation: () => dependencyConversation,
    });

    expect(context).toContain("Task 1.1");
    expect(context).toContain("### 摘要");
    expect(context).toContain("已完成首页设计稿，pageId=home-page。");
    expect(context).toContain("### 使用说明");
  });

  it("returns empty string when the task has no dependencies", () => {
    const context = buildDependencyResultContext({
      dependencies: [],
      parentConversation: {
        memory: {
          subTasks: {},
        },
      },
    });

    expect(context).toBe("");
  });
});
