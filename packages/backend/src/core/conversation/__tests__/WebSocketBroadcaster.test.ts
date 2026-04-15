import { describe, expect, mock, test } from "bun:test";
import { WebSocketBroadcaster } from "../lifecycle/WebSocketBroadcaster";

describe("WebSocketBroadcaster", () => {
  test("throttles partial broadcasts with the same type and updateTime", () => {
    const broadcaster = new WebSocketBroadcaster();
    const sentPayloads: Array<{ type: string; data: Record<string, unknown> }> = [];
    const ws = {
      send(payload: string) {
        sentPayloads.push(JSON.parse(payload));
      },
    } as any;

    const originalNow = Date.now;
    let now = 1_000;
    Date.now = () => now;

    try {
      broadcaster.addConnection("task-1", ws);

      broadcaster.broadcast("task-1", {
        type: "message",
        data: {
          message: "draft-1",
          partial: true,
          updateTime: 10,
        },
      });

      now += 100;
      broadcaster.broadcast("task-1", {
        type: "message",
        data: {
          message: "draft-2",
          partial: true,
          updateTime: 10,
        },
      });

      now += 300;
      broadcaster.broadcast("task-1", {
        type: "message",
        data: {
          message: "draft-3",
          partial: true,
          updateTime: 10,
        },
      });

      broadcaster.broadcast("task-1", {
        type: "message",
        data: {
          message: "final",
          partial: false,
          updateTime: 10,
        },
      });
    } finally {
      Date.now = originalNow;
    }

    expect(sentPayloads).toHaveLength(3);
    expect(sentPayloads[0]).toEqual({
      type: "message",
      data: expect.objectContaining({
        message: "draft-1",
        partial: true,
        updateTime: 10,
      }),
    });
    expect(sentPayloads[1]).toEqual({
      type: "message",
      data: expect.objectContaining({
        message: "draft-3",
        partial: true,
        updateTime: 10,
      }),
    });
    expect(sentPayloads[2]).toEqual({
      type: "message",
      data: expect.objectContaining({
        message: "final",
        partial: false,
        updateTime: 10,
      }),
    });
  });

  test("emitAndSave injects the conversation taskId into task-scoped messages", () => {
    const broadcaster = new WebSocketBroadcaster();
    const sentPayloads: Array<{ type: string; data: Record<string, unknown> }> = [];
    const ws = {
      send(payload: string) {
        sentPayloads.push(JSON.parse(payload));
      },
    } as any;
    const addWebsocketMessage = mock();

    broadcaster.addConnection("sub-task-1", ws);

    const conversation = {
      id: "sub-task-1",
      memory: {
        addWebsocketMessage,
      },
    } as any;

    broadcaster.emitAndSave(conversation, {
      type: "conversationOver",
      data: {
        reason: "interrupt",
      },
    });

    expect(sentPayloads).toHaveLength(1);
    expect(sentPayloads[0]).toEqual({
      type: "conversationOver",
      data: expect.objectContaining({
        reason: "interrupt",
        taskId: "sub-task-1",
      }),
    });

    expect(addWebsocketMessage).toHaveBeenCalledWith({
      type: "conversationOver",
      data: expect.objectContaining({
        reason: "interrupt",
        taskId: "sub-task-1",
      }),
    });
  });
});
