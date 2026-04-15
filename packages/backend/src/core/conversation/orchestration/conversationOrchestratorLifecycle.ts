import type { UserMessageAttachment, WorkflowMode } from "@amigo-llm/types";
import { createFastWorkflowState, createWorkflowState } from "@/core/workflow";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";
import type { Conversation } from "../Conversation";
import { conversationRepository } from "../ConversationRepository";
import { clearConversationContinuations } from "../context/asyncContinuations";
import { extractCompletedExecutionTaskResult } from "../execution/taskExecutionResult";
import type { ConversationExecutor } from "../lifecycle/ConversationExecutor";
import { broadcaster } from "../lifecycle/WebSocketBroadcaster";

const isMainControllerConversation = (conversation: Conversation): boolean =>
  !conversation.parentId && conversation.workflowAgentRole === "controller";

const shouldRestartWorkflowCycle = (conversation: Conversation): boolean =>
  isMainControllerConversation(conversation) &&
  conversation.status === "completed" &&
  conversation.currentWorkflowPhase === "complete";

const FAST_MODE_PATTERNS = [/快速模式/i, /fast\s*mode/i, /quick\s*mode/i, /直达模式/i];

const PHASED_MODE_PATTERNS = [
  /工作流模式/i,
  /标准模式/i,
  /spec\s*mode/i,
  /退出快速模式/i,
  /切回工作流/i,
];

const detectWorkflowModeDirective = (message: string): "fast" | "phased" | null => {
  if (FAST_MODE_PATTERNS.some((pattern) => pattern.test(message))) {
    return "fast";
  }

  if (PHASED_MODE_PATTERNS.some((pattern) => pattern.test(message))) {
    return "phased";
  }

  return null;
};

const resolveNextMainWorkflowState = async (
  conversation: Conversation,
  message: string,
  _attachments?: UserMessageAttachment[],
  preferredWorkflowMode?: WorkflowMode,
  options?: {
    allowRouteReclassification?: boolean;
  },
) => {
  if (preferredWorkflowMode === "fast") {
    if (
      options?.allowRouteReclassification === false &&
      conversation.workflowState.mode === "fast"
    ) {
      return null;
    }
    return createFastWorkflowState();
  }

  if (preferredWorkflowMode === "phased") {
    if (
      options?.allowRouteReclassification === false &&
      conversation.workflowState.mode === "phased"
    ) {
      return null;
    }
    return createWorkflowState();
  }

  const modeDirective = detectWorkflowModeDirective(message);

  if (modeDirective === "fast") {
    return createFastWorkflowState();
  }

  if (modeDirective === "phased") {
    return createWorkflowState();
  }

  if (options?.allowRouteReclassification === false) {
    return null;
  }

  return createWorkflowState();
};

const restartMainTaskWorkflowIfNeeded = async (
  conversation: Conversation,
  message: string,
  attachments?: UserMessageAttachment[],
  preferredWorkflowMode?: WorkflowMode,
): Promise<void> => {
  if (!isMainControllerConversation(conversation)) {
    return;
  }

  if (!shouldRestartWorkflowCycle(conversation)) {
    return;
  }

  logger.info(
    `[ConversationOrchestrator] taskId=${conversation.id} 已完成，收到新用户输入后重启新一轮主工作流`,
  );
  const nextWorkflowState =
    (await resolveNextMainWorkflowState(conversation, message, attachments, preferredWorkflowMode, {
      allowRouteReclassification: true,
    })) ||
    createWorkflowState({
      currentPhase: "requirements",
      agentRole: "controller",
    });
  conversation.restartMainWorkflowCycleForNextUserTurnWithState(nextWorkflowState, {
    preserveCompletionSeedHistory: true,
  });
};

export const setConversationUserInput = async (
  conversation: Conversation,
  message: string,
  attachments?: UserMessageAttachment[],
  preferredWorkflowMode?: WorkflowMode,
): Promise<void> => {
  logger.info(
    `[ConversationOrchestrator] setUserInput - taskId: ${conversation.id}, message: ${message}, attachments: ${attachments?.length || 0}`,
  );
  await restartMainTaskWorkflowIfNeeded(conversation, message, attachments, preferredWorkflowMode);

  if (isMainControllerConversation(conversation) && !shouldRestartWorkflowCycle(conversation)) {
    const nextWorkflowState = await resolveNextMainWorkflowState(
      conversation,
      message,
      attachments,
      preferredWorkflowMode,
      { allowRouteReclassification: false },
    );
    if (nextWorkflowState) {
      const currentState = JSON.stringify(conversation.workflowState);
      const targetState = JSON.stringify(nextWorkflowState);
      if (currentState !== targetState) {
        logger.info(
          `[ConversationOrchestrator] taskId=${conversation.id} 根据最新用户消息切换 workflow 模式/阶段`,
        );
        conversation.setWorkflowState(nextWorkflowState, {
          announce: true,
          forceAnnouncement: true,
        });
      }
    }
  }

  conversation.userInput = message;
  conversation.isAborted = false;

  conversation.memory.addMessage({
    role: "user",
    content: message,
    attachments,
    type: "userSendMessage",
    partial: false,
  });
  const lastMessage = conversation.memory.lastMessage;
  const memoryRuntime = getGlobalState("memoryRuntime");
  if (lastMessage && memoryRuntime) {
    void memoryRuntime.handleUserMessage({
      taskId: conversation.id,
      message: lastMessage,
      context: conversation.memory.context,
    });
  }

  const wsMessage = {
    type: "userSendMessage" as const,
    data: {
      message,
      attachments,
      updateTime: Date.now(),
      taskId: conversation.id,
      workflowMode: preferredWorkflowMode,
    },
  };
  conversation.memory.addWebsocketMessage(wsMessage);
};

const broadcastInterruptedConversation = (conversation: Conversation): void => {
  conversation.memory.addMessage({
    role: "assistant",
    content: "用户已打断会话。",
    type: "interrupt",
    partial: false,
  });

  const interruptMessage = {
    type: "interrupt" as const,
    data: {
      taskId: conversation.id,
      updateTime: Date.now(),
    },
  };
  conversation.memory.addWebsocketMessage(interruptMessage);
  broadcaster.broadcastConversation(conversation, interruptMessage);
  broadcaster.broadcastConversation(conversation, {
    type: "conversationOver",
    data: { reason: "interrupt" },
  });
  clearConversationContinuations(conversation.id);
};

export const interruptConversation = ({
  conversation,
  executors,
  interruptChildConversation,
}: {
  conversation: Conversation;
  executors: Map<string, ConversationExecutor>;
  interruptChildConversation: (conversation: Conversation) => void;
}): void => {
  const activeChildConversations = conversationRepository
    .getAll()
    .filter(
      (conv) =>
        conv.parentId === conversation.id &&
        conv.status !== "aborted" &&
        conv.status !== "completed",
    );

  if (conversation.status === "aborted") {
    logger.info(`会话状态为 ${conversation.status}，无需打断。`);
    return;
  }

  if (
    ["idle", "completed"].includes(conversation.status) &&
    activeChildConversations.length === 0
  ) {
    logger.info(`会话状态为 ${conversation.status}，无需打断。`);
    return;
  }

  if (conversation.status === "waiting_tool_confirmation") {
    logger.info("取消工具确认");
    conversation.pendingToolCall = null;
    conversation.isAborted = true;
    conversation.status = "aborted";
    conversation.userInput = "";
    broadcastInterruptedConversation(conversation);
    return;
  }

  logger.info("会话已被打断。");
  conversation.isAborted = true;

  const executor = executors.get(conversation.id);
  const controller = executor?.getCurrentAbortController();
  if (controller) {
    controller.abort();
    executor?.clearAbortController();
  }

  conversation.status = "aborted";
  conversation.userInput = "";
  broadcastInterruptedConversation(conversation);

  for (const child of activeChildConversations) {
    interruptChildConversation(child);
  }
};

export const resumeConversation = (conversation: Conversation): void => {
  logger.info("会话已恢复。");
  conversation.isAborted = false;
  conversation.status = "streaming";
  conversation.userInput = "请继续完成之前被中断的任务。";
};

export const resolveExecutionTaskResult = (conversation: Conversation): string => {
  const result = extractCompletedExecutionTaskResult(conversation);
  if (result) {
    return result;
  }

  const lastMessage = conversation.memory.lastMessage;
  if (!lastMessage) {
    throw new Error(`执行会话 ${conversation.id} 没有返回最终消息`);
  }
  return lastMessage.content;
};
