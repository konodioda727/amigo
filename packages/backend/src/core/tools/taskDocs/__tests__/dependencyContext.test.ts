import { describe, expect, it } from "bun:test";
import { buildDependencyResultContext } from "../dependencyContext";

describe("buildDependencyResultContext", () => {
  it("injects completeTask results for declared dependencies", () => {
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
      loadConversation: () =>
        ({
          memory: {
            messages: [
              {
                role: "assistant",
                type: "tool",
                partial: false,
                content: JSON.stringify({
                  toolName: "completeTask",
                  params: {
                    result: "已完成首页设计稿，pageId=home-page。",
                  },
                }),
              } as any,
            ],
          },
        }) as any,
    });

    expect(context).toContain("Task 1.1");
    expect(context).toContain("已完成首页设计稿，pageId=home-page。");
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
