import { describe, expect, mock, test } from "bun:test";
import { WebSocketBroadcaster } from "../WebSocketBroadcaster";

describe("WebSocketBroadcaster", () => {
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
