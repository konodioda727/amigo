import type { ToolInterface, UserMessageAttachment } from "@amigo-llm/types";
import pWaitFor from "p-wait-for";
import { logger } from "@/utils/logger";
import { createExecutionWorkerWorkflowState } from "../../workflow";
import type { Conversation } from "../Conversation";
import { conversationRepository } from "../ConversationRepository";
import type { ConversationExecutor } from "../lifecycle/ConversationExecutor";
import { resolveExecutionTaskResult } from "./conversationOrchestratorLifecycle";

const WORKFLOW_STATE_MESSAGE_PREFIX = "[WorkflowState]";
const INHERITED_PARENT_HISTORY_MARKER = "[InheritedParentHistory]";

const isWorkflowStateMessage = (
  message: Conversation["memory"]["messages"][number],
  phase: string,
  role?: string,
): boolean =>
  message.content.startsWith(WORKFLOW_STATE_MESSAGE_PREFIX) &&
  message.content.includes(`当前阶段：${phase}`) &&
  (role ? message.content.includes(`当前角色：${role}`) : true);

const cloneParentHistoryMessage = (
  message: Conversation["memory"]["messages"][number],
): Conversation["memory"]["messages"][number] => ({
  ...message,
  partial: false,
  attachments: message.attachments ? [...message.attachments] : undefined,
});

const getDesignHistoryStartIndex = (messages: Conversation["memory"]["messages"]): number => {
  const latestDesignStateIndex = messages.findLastIndex((message) =>
    isWorkflowStateMessage(message, "design", "controller"),
  );
  if (latestDesignStateIndex >= 0) {
    return latestDesignStateIndex;
  }

  const latestCheckpointIndex = messages.findLastIndex(
    (message) => message.type === "checkpoint" || message.type === "compaction",
  );
  return latestCheckpointIndex >= 0 ? latestCheckpointIndex : 0;
};

const getDesignHistoryEndIndex = (
  messages: Conversation["memory"]["messages"],
  startIndex: number,
): number => {
  const hasDesignState = messages
    .slice(startIndex)
    .some((message) => isWorkflowStateMessage(message, "design", "controller"));
  if (!hasDesignState) {
    return messages.length;
  }

  const executionControllerOffset = messages
    .slice(startIndex + 1)
    .findIndex((message) => isWorkflowStateMessage(message, "execution", "controller"));

  return executionControllerOffset >= 0
    ? startIndex + 1 + executionControllerOffset
    : messages.length;
};

const isFinishPhaseToolMessage = (message: Conversation["memory"]["messages"][number]): boolean => {
  if (message.type !== "tool" || typeof message.content !== "string") {
    return false;
  }

  return message.content.includes('"toolName":"finishPhase"');
};

const shouldInheritParentHistoryMessage = (
  message: Conversation["memory"]["messages"][number],
): boolean => {
  if (message.partial) {
    return false;
  }

  if (message.type.startsWith("ws:")) {
    return false;
  }

  if (message.type === "interrupt") {
    return false;
  }

  if (isFinishPhaseToolMessage(message)) {
    return false;
  }

  if (
    message.type === "checkpoint" &&
    typeof message.content === "string" &&
    message.content.includes("类型：task_complete")
  ) {
    return false;
  }

  return true;
};

const inheritParentDesignHistory = ({
  parentConversation,
  executionConversation,
}: {
  parentConversation: Conversation;
  executionConversation: Conversation;
}): void => {
  const sourceMessages = parentConversation.memory.messages.filter(
    shouldInheritParentHistoryMessage,
  );
  if (sourceMessages.length === 0) {
    return;
  }

  const startIndex = getDesignHistoryStartIndex(sourceMessages);
  const endIndex = getDesignHistoryEndIndex(sourceMessages, startIndex);
  const inheritedMessages = sourceMessages.slice(startIndex, endIndex);
  if (inheritedMessages.length === 0) {
    return;
  }

  executionConversation.memory.addMessage({
    role: "user",
    type: "system",
    partial: false,
    content:
      `${INHERITED_PARENT_HISTORY_MARKER}\n` +
      "以下是父任务从 design 阶段开始的历史记录，只作背景参考，不改变你当前 execution_worker 角色。",
  });

  for (const message of inheritedMessages) {
    executionConversation.memory.addMessage(cloneParentHistoryMessage(message));
  }
};

export interface ExecutionTaskParams {
  subPrompt: string;
  target: string;
  parentId: string;
  conversationContext?: unknown;
  toolNames?: string[];
  tools: ToolInterface<any>[];
  attachments?: UserMessageAttachment[];
  taskDescription?: string;
  executionTaskId?: string;
}

export interface ExecutionTaskRunResult {
  executionTaskId: string;
  result: string;
  status: "completed" | "interrupted";
}

export class ExecutionTaskInterruptedError extends Error {
  constructor(executionTaskId: string) {
    super(`执行会话 ${executionTaskId} 已被中断`);
    this.name = "ExecutionTaskInterruptedError";
  }
}

export const resolveObservedExecutionTaskStatus = ({
  currentStatus,
  hasObservedActiveState,
}: {
  currentStatus: string;
  hasObservedActiveState: boolean;
}): "running" | "interrupted" | null => {
  if (
    currentStatus === "streaming" ||
    currentStatus === "tool_executing" ||
    currentStatus === "waiting_tool_confirmation"
  ) {
    return "running";
  }

  if (hasObservedActiveState && currentStatus === "idle") {
    return "interrupted";
  }

  return null;
};

const getOrCreateExecutionConversation = ({
  parentId,
  subPrompt,
  conversationContext,
  toolNames,
  tools,
  executionTaskId,
}: Pick<
  ExecutionTaskParams,
  "parentId" | "subPrompt" | "conversationContext" | "toolNames" | "tools" | "executionTaskId"
>): {
  parentConversation: Conversation;
  executionConversation: Conversation;
  isNewConversation: boolean;
} => {
  const mergeConversationContext = (baseContext: unknown, extraContext: unknown): unknown => {
    if (extraContext === undefined) {
      return baseContext;
    }
    if (
      !baseContext ||
      typeof baseContext !== "object" ||
      Array.isArray(baseContext) ||
      !extraContext ||
      typeof extraContext !== "object" ||
      Array.isArray(extraContext)
    ) {
      return extraContext;
    }

    return {
      ...baseContext,
      ...extraContext,
    };
  };

  const parentConversation = conversationRepository.get(parentId);
  if (!parentConversation) {
    throw new Error(`未找到父会话，父任务ID：${parentId}`);
  }

  const existingConversation = executionTaskId
    ? conversationRepository.load(executionTaskId)
    : null;
  if (existingConversation) {
    logger.info(`[ConversationOrchestrator] 复用执行会话: ${existingConversation.id}`);
    return {
      parentConversation,
      executionConversation: existingConversation,
      isNewConversation: false,
    };
  }

  const executionConversation = conversationRepository.create({
    parentId,
    customPrompt: subPrompt,
    toolNames,
    tools,
    llm: parentConversation.llm,
    context: mergeConversationContext(parentConversation.memory.context, conversationContext),
    modelConfigSnapshot: parentConversation.memory.modelConfigSnapshot,
    workflowState: createExecutionWorkerWorkflowState(),
  });
  inheritParentDesignHistory({
    parentConversation,
    executionConversation,
  });

  return {
    parentConversation,
    executionConversation,
    isNewConversation: true,
  };
};

const syncExecutionTaskStart = ({
  parentConversation,
  executionConversation,
  taskDescription,
}: {
  parentConversation: Conversation;
  executionConversation: Conversation;
  taskDescription?: string;
}): void => {
  if (!taskDescription) {
    return;
  }

  parentConversation.updateExecutionTaskStatus(taskDescription, {
    executionTaskId: executionConversation.id,
    status: "running",
    startedAt: new Date().toISOString(),
  });
};

const startExecutionConversationIfNeeded = async ({
  executionConversation,
  isNewConversation,
  target,
  attachments,
  toolNames,
  tools,
  getExecutor,
  setUserInput,
  resumeConversation,
}: {
  executionConversation: Conversation;
  isNewConversation: boolean;
  target: string;
  attachments?: UserMessageAttachment[];
  toolNames?: string[];
  tools: ToolInterface<any>[];
  getExecutor: (conversationId: string) => ConversationExecutor;
  setUserInput: (
    conversation: Conversation,
    message: string,
    attachments?: UserMessageAttachment[],
  ) => Promise<void>;
  resumeConversation: (conversation: Conversation) => void;
}): Promise<void> => {
  let shouldExecute = false;
  if (isNewConversation) {
    const selectedToolNames = toolNames?.length ? toolNames : tools.map((tool) => tool.name);
    executionConversation.memory.setToolNames(selectedToolNames);
    await setUserInput(executionConversation, target, attachments);
    shouldExecute = true;
  } else if (["idle", "aborted", "error"].includes(executionConversation.status)) {
    resumeConversation(executionConversation);
    shouldExecute = true;
  }

  if (!shouldExecute) {
    return;
  }

  const executor = getExecutor(executionConversation.id);
  executor.execute(executionConversation);
};

const waitForExecutionConversation = async ({
  parentConversation,
  executionConversation,
  taskDescription,
}: {
  parentConversation: Conversation;
  executionConversation: Conversation;
  taskDescription?: string;
}): Promise<"completed" | "interrupted"> => {
  let hasObservedActiveState = false;
  let lastSyncedStatus: "running" | "interrupted" | null = taskDescription ? "running" : null;

  await pWaitFor(
    () => {
      const currentStatus = executionConversation.status;
      const isExecutionTaskActive = [
        "streaming",
        "tool_executing",
        "waiting_tool_confirmation",
      ].includes(currentStatus);

      if (isExecutionTaskActive) {
        hasObservedActiveState = true;
      }

      if (taskDescription) {
        const observedStatus = resolveObservedExecutionTaskStatus({
          currentStatus,
          hasObservedActiveState,
        });

        if (observedStatus && lastSyncedStatus !== observedStatus) {
          parentConversation.updateExecutionTaskStatus(taskDescription, {
            status: observedStatus,
          });
          lastSyncedStatus = observedStatus;
        }
      }

      if (currentStatus === "aborted") {
        if (taskDescription) {
          parentConversation.updateExecutionTaskStatus(taskDescription, {
            status: "interrupted",
            error: "执行任务被中断。",
          });
        }
        throw new ExecutionTaskInterruptedError(executionConversation.id);
      }

      if (currentStatus === "error") {
        throw new Error(`执行会话 ${executionConversation.id} 已停止，当前状态: ${currentStatus}`);
      }

      if (hasObservedActiveState && currentStatus === "idle") {
        return true;
      }

      return currentStatus === "completed";
    },
    { timeout: 30 * 60 * 1000 },
  );

  return executionConversation.status === "idle" ? "interrupted" : "completed";
};

const finalizeExecutionTaskStatus = ({
  parentConversation,
  executionConversation,
  taskDescription,
  status,
}: {
  parentConversation: Conversation;
  executionConversation: Conversation;
  taskDescription?: string;
  status: "completed" | "interrupted";
}): void => {
  if (!taskDescription) {
    return;
  }

  if (status === "interrupted") {
    parentConversation.updateExecutionTaskStatus(taskDescription, {
      status,
      executionTaskId: executionConversation.id,
    });
    return;
  }

  parentConversation.updateExecutionTaskStatus(taskDescription, {
    status,
    completedAt: new Date().toISOString(),
  });
};

export const runExecutionTaskWithOrchestrator = async ({
  params,
  getExecutor,
  removeExecutor,
  setUserInput,
  resumeConversation,
}: {
  params: ExecutionTaskParams;
  getExecutor: (conversationId: string) => ConversationExecutor;
  removeExecutor: (conversationId: string) => void;
  setUserInput: (
    conversation: Conversation,
    message: string,
    attachments?: UserMessageAttachment[],
  ) => Promise<void>;
  resumeConversation: (conversation: Conversation) => void;
}): Promise<ExecutionTaskRunResult> => {
  const {
    subPrompt,
    parentId,
    conversationContext,
    toolNames,
    tools,
    target,
    attachments,
    taskDescription,
    executionTaskId,
  } = params;
  const { parentConversation, executionConversation, isNewConversation } =
    getOrCreateExecutionConversation({
      parentId,
      subPrompt,
      conversationContext,
      toolNames,
      tools,
      executionTaskId,
    });

  syncExecutionTaskStart({
    parentConversation,
    executionConversation,
    taskDescription,
  });
  await startExecutionConversationIfNeeded({
    executionConversation,
    isNewConversation,
    target,
    attachments,
    toolNames,
    tools,
    getExecutor,
    setUserInput,
    resumeConversation,
  });

  const status = await waitForExecutionConversation({
    parentConversation,
    executionConversation,
    taskDescription,
  });
  logger.info(
    `执行会话 ${executionConversation.id} 已${status === "interrupted" ? "中断" : "完成"}。`,
  );
  finalizeExecutionTaskStatus({
    parentConversation,
    executionConversation,
    taskDescription,
    status,
  });
  removeExecutor(executionConversation.id);

  return {
    executionTaskId: executionConversation.id,
    result: resolveExecutionTaskResult(executionConversation),
    status,
  };
};
