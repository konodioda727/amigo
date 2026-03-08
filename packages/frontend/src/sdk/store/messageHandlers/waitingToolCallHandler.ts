import type { WebSocketMessage } from "@amigo-llm/types";
import type { WebSocketStore } from "../websocket";
import type { MessageHandler } from ".";

const extractPendingToolCallFromRawMessages = (
  rawMessages: WebSocketStore["tasks"][string]["rawMessages"],
  expectedToolName?: string,
) => {
  for (let i = rawMessages.length - 1; i >= 0; i--) {
    const msg = rawMessages[i];
    if (msg.type !== "tool") continue;

    try {
      const msgData = msg.data as { message: string };
      const toolData = JSON.parse(msgData.message) as { toolName?: string; params?: any };

      if (!toolData.toolName) continue;
      if (expectedToolName && toolData.toolName !== expectedToolName) continue;

      return {
        toolName: toolData.toolName,
        params: toolData.params,
      };
    } catch {
      // ignore parse error and continue searching older tool messages
    }
  }

  return null;
};

export const handleWaitingToolCall: MessageHandler = (
  message: WebSocketMessage<"waiting_tool_call">,
  store: WebSocketStore,
): boolean => {
  const { taskId, toolName, params } = message.data as {
    taskId: string;
    toolName?: string;
    params?: any;
  };

  // Use registerTask instead of ensureTask to maintain consistency
  store.registerTask(taskId);

  store.setTaskStatus(taskId, "waiting_tool_call");

  let resolvedToolName = toolName;
  let resolvedParams = params;

  const task = store.tasks[taskId];
  if (task && (!resolvedToolName || resolvedParams === undefined)) {
    const fallback = extractPendingToolCallFromRawMessages(task.rawMessages, resolvedToolName);
    if (fallback) {
      resolvedToolName = resolvedToolName || fallback.toolName;
      if (resolvedParams === undefined) {
        resolvedParams = fallback.params;
      }
    }
  }

  if (resolvedToolName) {
    store.setPendingToolCall(taskId, {
      toolName: resolvedToolName,
      params: resolvedParams,
    });
  } else {
    store.setPendingToolCall(taskId, undefined);
  }

  return true;
};
