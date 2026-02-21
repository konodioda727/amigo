import type { WebSocketMessage } from "@amigo-llm/types";
import type { WebSocketStore } from "../websocket";
import type { MessageHandler } from ".";

export const handleWaitingToolCall: MessageHandler = (
  message: WebSocketMessage<"waiting_tool_call">,
  store: WebSocketStore,
): boolean => {
  const { taskId } = message.data;

  console.log("[waitingToolCallHandler] Received waiting_tool_call message:", {
    taskId,
    messageData: message.data,
  });

  // Use registerTask instead of ensureTask to maintain consistency
  store.registerTask(taskId);

  store.setTaskStatus(taskId, "waiting_tool_call");

  // Extract toolName and params from the previous tool message
  const task = store.tasks[taskId];
  console.log("[waitingToolCallHandler] Task state:", {
    hasTask: !!task,
    rawMessagesCount: task?.rawMessages.length,
    taskStatus: task?.status,
  });

  if (task && task.rawMessages.length > 0) {
    // Find the last tool message before this waiting_tool_call
    for (let i = task.rawMessages.length - 1; i >= 0; i--) {
      const msg = task.rawMessages[i];
      console.log(`[waitingToolCallHandler] Checking message ${i}:`, {
        type: msg.type,
        hasData: !!msg.data,
      });

      if (msg.type === "tool") {
        try {
          const msgData = msg.data as { message: string };
          console.log("[waitingToolCallHandler] Found tool message:", {
            messageContent: msgData.message,
          });

          const toolData = JSON.parse(msgData.message);
          console.log("[waitingToolCallHandler] Parsed tool data:", {
            toolName: toolData.toolName,
            hasParams: !!toolData.params,
          });

          if (toolData.toolName && toolData.params) {
            store.setPendingToolCall(taskId, {
              toolName: toolData.toolName,
              params: toolData.params,
            });
            console.log("[waitingToolCallHandler] Set pending tool call:", {
              toolName: toolData.toolName,
              params: toolData.params,
            });
            break;
          }
        } catch (e) {
          console.error("[waitingToolCallHandler] Failed to parse tool message:", e);
        }
      }
    }
  }

  // Log final task state
  const finalTask = store.tasks[taskId];
  console.log("[waitingToolCallHandler] Final task state:", {
    status: finalTask?.status,
    hasPendingToolCall: !!finalTask?.pendingToolCall,
    pendingToolCall: finalTask?.pendingToolCall,
  });

  return true;
};
