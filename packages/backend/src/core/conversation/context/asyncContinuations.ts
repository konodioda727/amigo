import type { WebSocketMessage } from "@amigo-llm/types";
import { logger } from "@/utils/logger";
import type { Conversation } from "../Conversation";
import { broadcaster } from "../lifecycle/WebSocketBroadcaster";

interface ConversationContinuation {
  id: string;
  reason: string;
  run: (conversation: Conversation) => Promise<void> | void;
  injectBeforeNextTurn: (conversation: Conversation) => Promise<void> | void;
}

const queuedContinuations = new Map<string, ConversationContinuation[]>();

const createContinuationId = () => `cont_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function enqueueConversationContinuation(params: {
  conversation: Conversation;
  reason: string;
  run: (conversation: Conversation) => Promise<void> | void;
  injectBeforeNextTurn: (conversation: Conversation) => Promise<void> | void;
}): string {
  const continuation: ConversationContinuation = {
    id: createContinuationId(),
    reason: params.reason,
    run: params.run,
    injectBeforeNextTurn: params.injectBeforeNextTurn,
  };

  const taskId = params.conversation.id;
  const queue = queuedContinuations.get(taskId) || [];
  queue.push(continuation);
  queuedContinuations.set(taskId, queue);
  logger.info(
    `[AsyncContinuation] 已加入队列 task=${taskId} continuation=${continuation.id} reason=${params.reason}`,
  );
  return continuation.id;
}

export async function flushConversationContinuationsBeforeNextTurn(
  conversation: Conversation,
): Promise<boolean> {
  if (
    conversation.isAborted ||
    ["waiting_tool_confirmation", "completed", "aborted", "error"].includes(conversation.status)
  ) {
    return false;
  }

  const queue = queuedContinuations.get(conversation.id);
  if (!queue || queue.length === 0) {
    return false;
  }

  let applied = false;
  const remaining: ConversationContinuation[] = [];

  while (queue.length > 0) {
    if (
      conversation.isAborted ||
      ["waiting_tool_confirmation", "completed", "aborted", "error"].includes(conversation.status)
    ) {
      remaining.push(...queue);
      break;
    }

    const continuation = queue.shift();
    if (!continuation) {
      break;
    }

    logger.info(
      `[AsyncContinuation] 会话循环前注入 task=${conversation.id} continuation=${continuation.id} reason=${continuation.reason}`,
    );

    try {
      await continuation.injectBeforeNextTurn(conversation);
      applied = true;
    } catch (error) {
      logger.error(
        `[AsyncContinuation] 循环前注入失败 task=${conversation.id} continuation=${continuation.id}:`,
        error,
      );
    }
  }

  if (remaining.length === 0) {
    queuedContinuations.delete(conversation.id);
  } else {
    queuedContinuations.set(conversation.id, remaining);
  }

  return applied;
}

function emitAutoResumeAck(conversation: Conversation): void {
  const message: WebSocketMessage<"ack"> = {
    type: "ack",
    data: {
      taskId: conversation.id,
      targetMessage: {
        type: "resume",
        data: {
          taskId: conversation.id,
        },
      },
      status: "acked",
    },
  };

  broadcaster.broadcast(conversation.id, message);
}

export async function flushConversationContinuationsIfIdle(
  conversation: Conversation,
): Promise<void> {
  if (conversation.isAborted || conversation.status !== "idle") {
    return;
  }

  const queue = queuedContinuations.get(conversation.id);
  if (!queue || queue.length === 0) {
    return;
  }

  while (queue.length > 0) {
    if (conversation.isAborted || conversation.status !== "idle") {
      break;
    }

    const continuation = queue.shift();
    if (!continuation) {
      break;
    }

    logger.info(
      `[AsyncContinuation] 开始执行 task=${conversation.id} continuation=${continuation.id} reason=${continuation.reason}`,
    );
    try {
      emitAutoResumeAck(conversation);
      await continuation.injectBeforeNextTurn(conversation);
      await continuation.run(conversation);
    } catch (error) {
      logger.error(
        `[AsyncContinuation] 执行失败 task=${conversation.id} continuation=${continuation.id}:`,
        error,
      );
    }
  }

  if (queue.length === 0) {
    queuedContinuations.delete(conversation.id);
  } else {
    queuedContinuations.set(conversation.id, queue);
  }
}

export function hasConversationContinuations(taskId: string): boolean {
  const queue = queuedContinuations.get(taskId);
  return !!queue && queue.length > 0;
}

export function clearConversationContinuations(taskId: string): void {
  queuedContinuations.delete(taskId);
}
