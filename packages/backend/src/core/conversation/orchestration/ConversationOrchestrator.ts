import type { UserMessageAttachment } from "@amigo-llm/types";
import type { Conversation } from "../Conversation";
import { ConversationExecutor } from "../lifecycle/ConversationExecutor";
import {
  ExecutionTaskInterruptedError,
  type ExecutionTaskParams,
  type ExecutionTaskRunResult,
  resolveObservedExecutionTaskStatus,
  runExecutionTaskWithOrchestrator,
} from "./conversationOrchestratorExecution";
import {
  interruptConversation,
  resumeConversation,
  setConversationUserInput,
} from "./conversationOrchestratorLifecycle";
/**
 * 会话编排器 - 管理会话执行、恢复、中断，以及 execution worker 会话的派生执行
 */
export class ConversationOrchestrator {
  private executors = new Map<string, ConversationExecutor>();

  getExecutor(conversationId: string): ConversationExecutor {
    let executor = this.executors.get(conversationId);
    if (!executor) {
      executor = new ConversationExecutor();
      this.executors.set(conversationId, executor);
    }
    return executor;
  }

  removeExecutor(conversationId: string): void {
    this.executors.delete(conversationId);
  }

  async runExecutionTask(params: ExecutionTaskParams): Promise<ExecutionTaskRunResult> {
    return runExecutionTaskWithOrchestrator({
      params,
      getExecutor: (conversationId) => this.getExecutor(conversationId),
      removeExecutor: (conversationId) => this.removeExecutor(conversationId),
      setUserInput: async (conversation, message, attachments) =>
        this.setUserInput(conversation, message, attachments),
      resumeConversation: (conversation) => this.resume(conversation),
    });
  }

  async setUserInput(
    conversation: Conversation,
    message: string,
    attachments?: UserMessageAttachment[],
  ): Promise<void> {
    await setConversationUserInput(conversation, message, attachments);
  }

  interrupt(conversation: Conversation): void {
    interruptConversation({
      conversation,
      executors: this.executors,
      interruptChildConversation: (childConversation) => this.interrupt(childConversation),
    });
  }

  resume(conversation: Conversation): void {
    resumeConversation(conversation);
  }
}

export { ExecutionTaskInterruptedError, resolveObservedExecutionTaskStatus };
export type { ExecutionTaskParams, ExecutionTaskRunResult };

export const conversationOrchestrator = new ConversationOrchestrator();
