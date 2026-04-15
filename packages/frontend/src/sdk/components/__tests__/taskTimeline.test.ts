import "../../provider/__tests__/setup";
import { describe, expect, it } from "bun:test";
import type { DisplayMessageType } from "../../messages/types";
import { buildTaskTimeline } from "../taskTimeline";

describe("taskTimeline", () => {
  it("keeps process messages and tool messages in original order", () => {
    const messages: DisplayMessageType[] = [
      {
        type: "userSendMessage",
        message: "做一下这个任务",
        updateTime: 0,
      },
      {
        type: "message",
        message: "先分析一下",
        updateTime: 10_000,
      },
      {
        type: "tool",
        toolName: "readFile",
        params: {
          filePaths: ["/tmp/demo.ts"],
        } as any,
        updateTime: 60_000,
      },
      {
        type: "message",
        message: "需求已经确认",
        updateTime: 90_000,
      },
      {
        type: "tool",
        toolName: "completeTask",
        workflowPhase: "requirements",
        websocketData: {
          kind: "phase_complete",
          completedPhase: "requirements",
          currentPhase: "design",
          agentRole: "controller",
        },
        params: {
          summary: "需求确认完毕",
          result: "需求文档整理好了",
        },
        toolOutput: "阶段 requirements 已完成，已进入 design",
        updateTime: 120_000,
      },
      {
        type: "tool",
        toolName: "readFile",
        params: {
          filePaths: ["/tmp/demo2.ts"],
        } as any,
        updateTime: 150_000,
      },
      {
        type: "message",
        message: "执行已经完成",
        updateTime: 170_000,
      },
      {
        type: "tool",
        toolName: "completeTask",
        workflowPhase: "execution",
        websocketData: {
          kind: "phase_complete",
          completedPhase: "execution",
          currentPhase: "verification",
          agentRole: "controller",
        },
        params: {
          summary: "执行完成",
          result: "执行阶段结果",
        },
        toolOutput: "阶段 execution 已完成，已进入 verification",
        updateTime: 180_000,
      },
      {
        type: "message",
        message: "开始验证",
        updateTime: 210_000,
      },
    ] as DisplayMessageType[];

    const timeline = buildTaskTimeline({
      messages,
      taskStatus: "streaming",
    });

    expect(timeline).toHaveLength(messages.length);
    expect(timeline.every((node) => node.kind === "message")).toBe(true);
    expect(timeline.map((node) => node.message)).toEqual(messages);
  });

  it("keeps completeTask visible without folding earlier process output", () => {
    const messages: DisplayMessageType[] = [
      {
        type: "userSendMessage",
        message: "先做设计",
        updateTime: 0,
      },
      {
        type: "tool",
        toolName: "readFile",
        params: {
          filePaths: ["/tmp/design.md"],
        } as any,
        updateTime: 30_000,
      },
      {
        type: "message",
        message: "方案 A 可行",
        updateTime: 60_000,
      },
      {
        type: "message",
        message: "方案 B 风险更高",
        updateTime: 90_000,
      },
      {
        type: "tool",
        toolName: "completeTask",
        workflowPhase: "design",
        websocketData: {
          kind: "phase_complete",
          completedPhase: "design",
          currentPhase: "execution",
          agentRole: "controller",
        },
        params: {
          summary: "设计完成",
          result: "这是设计结果",
        },
        toolOutput: "阶段 design 已完成，已进入 execution",
        updateTime: 180_000,
      },
    ] as DisplayMessageType[];

    const timeline = buildTaskTimeline({
      messages,
      taskStatus: "completed",
    });

    expect(timeline).toHaveLength(messages.length);
    expect(timeline[1]?.message).toEqual(
      expect.objectContaining({
        type: "tool",
        toolName: "readFile",
      }),
    );
    expect(timeline[4]?.message).toEqual(
      expect.objectContaining({
        type: "tool",
        toolName: "completeTask",
        workflowPhase: "design",
      }),
    );
  });

  it("does not collapse assistant output runs that are not followed by completeTask", () => {
    const messages: DisplayMessageType[] = [
      {
        type: "message",
        message: "先分析一下",
        updateTime: 0,
      },
      {
        type: "message",
        message: "继续补充说明",
        updateTime: 60_000,
      },
      {
        type: "tool",
        toolName: "readFile",
        params: {
          filePaths: ["/tmp/demo.ts"],
        } as any,
        updateTime: 120_000,
      },
    ] as DisplayMessageType[];

    const timeline = buildTaskTimeline({
      messages,
      taskStatus: "completed",
    });

    expect(timeline).toHaveLength(3);
    expect(timeline.every((node) => node.kind === "message")).toBe(true);
  });

  it("supports legacy completeTask messages without workflow metadata", () => {
    const messages: DisplayMessageType[] = [
      {
        type: "message",
        message: "这是最终答复的草稿",
        updateTime: 60_000,
      },
      {
        type: "tool",
        toolName: "completeTask",
        params: {
          summary: "最终结果",
          result: "这是最终答复",
        },
        toolOutput: "任务已完成",
        updateTime: 180_000,
      },
    ] as DisplayMessageType[];

    const timeline = buildTaskTimeline({
      messages,
      taskStatus: "completed",
    });

    expect(timeline).toHaveLength(2);
    expect(timeline[0]?.message).toEqual(
      expect.objectContaining({
        type: "message",
        message: "这是最终答复的草稿",
      }),
    );
    expect(timeline[1]?.message).toEqual(
      expect.objectContaining({
        type: "tool",
        toolName: "completeTask",
      }),
    );
  });
});
