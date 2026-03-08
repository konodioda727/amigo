import "../../provider/__tests__/setup";
import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { WebSocketContext, type WebSocketContextValue } from "../../context/WebSocketContext";
import { createWebSocketStore } from "../../store/createWebSocketStore";
import { useSendMessage } from "../useSendMessage";

function renderWithContext(contextValue: WebSocketContextValue) {
  function TestComponent() {
    const { sendConfirm } = useSendMessage();

    return (
      <button type="button" data-testid="confirm" onClick={() => sendConfirm("task-1")}>
        confirm
      </button>
    );
  }

  return render(
    <WebSocketContext.Provider value={contextValue}>
      <TestComponent />
    </WebSocketContext.Provider>,
  );
}

describe("useSendMessage sendConfirm", () => {
  it("keeps completeTask confirmations out of streaming state", () => {
    const store = createWebSocketStore({ autoConnect: false });
    const send = mock();

    store.setState({
      socket: {
        readyState: WebSocket.OPEN,
        send,
      } as any,
      activeTaskId: "task-1",
      mainTaskId: "task-1",
      tasks: {
        "task-1": {
          rawMessages: [],
          displayMessages: [],
          status: "waiting_tool_call",
          lastUpdateTime: Date.now(),
          pendingToolCall: {
            toolName: "completeTask",
            params: { result: "done" },
          },
        },
      },
    });

    const contextValue: WebSocketContextValue = {
      store,
      config: {
        url: "ws://localhost:10013",
        autoConnect: false,
        reconnect: true,
        reconnectInterval: 3000,
        reconnectAttempts: 5,
      },
      handlers: {},
    };

    const { getByTestId } = renderWithContext(contextValue);
    fireEvent.click(getByTestId("confirm"));

    expect(store.getState().tasks["task-1"]?.status).toBe("idle");
    expect(store.getState().tasks["task-1"]?.pendingToolCall).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("still marks other tool confirmations as streaming", () => {
    const store = createWebSocketStore({ autoConnect: false });

    store.setState({
      socket: {
        readyState: WebSocket.OPEN,
        send: mock(),
      } as any,
      activeTaskId: "task-1",
      mainTaskId: "task-1",
      tasks: {
        "task-1": {
          rawMessages: [],
          displayMessages: [],
          status: "waiting_tool_call",
          lastUpdateTime: Date.now(),
          pendingToolCall: {
            toolName: "bash",
            params: { command: "pwd" },
          },
        },
      },
    });

    const contextValue: WebSocketContextValue = {
      store,
      config: {
        url: "ws://localhost:10013",
        autoConnect: false,
        reconnect: true,
        reconnectInterval: 3000,
        reconnectAttempts: 5,
      },
      handlers: {},
    };

    const { getByTestId } = renderWithContext(contextValue);
    fireEvent.click(getByTestId("confirm"));

    expect(store.getState().tasks["task-1"]?.status).toBe("streaming");
  });
});
