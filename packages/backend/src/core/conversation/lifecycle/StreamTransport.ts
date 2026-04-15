import type { ChatMessage, SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import { isWhitespaceOnly } from "@/utils/isWhiteSpaceOnly";
import type { Conversation } from "../Conversation";
import { broadcaster } from "./WebSocketBroadcaster";

export class StreamTransport {
  private readonly toolCallDraftUpdateTimes = new Map<string, number>();

  emitPartialMessage(conversation: Conversation, message: string): void {
    if (this.shouldSkipTextEmission(conversation, message)) {
      return;
    }

    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: message,
      type: "message",
      partial: true,
    });
  }

  emitFinalMessage(conversation: Conversation, message: string): void {
    if (this.shouldSkipTextEmission(conversation, message)) {
      return;
    }

    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: message,
      type: "message",
      partial: false,
    });
  }

  emitPartialThink(
    conversation: Conversation,
    think: string,
    updateTime: number | null,
  ): number | null {
    if (this.shouldSkipTextEmission(conversation, think)) {
      return updateTime;
    }

    const stableUpdateTime = updateTime ?? Date.now();
    broadcaster.emitAndSave(conversation, {
      type: "think",
      data: {
        message: think,
        partial: true,
        updateTime: stableUpdateTime,
      },
    });
    return stableUpdateTime;
  }

  emitFinalThink(conversation: Conversation, think: string, updateTime: number | null): void {
    if (this.shouldSkipTextEmission(conversation, think)) {
      return;
    }

    broadcaster.emitAndSave(conversation, {
      type: "think",
      data: {
        message: think,
        partial: false,
        updateTime: updateTime ?? Date.now(),
      },
    });
  }

  emitPartialToolCallDraft(
    conversation: Conversation,
    messageType: ChatMessage["type"],
    toolName: string,
    toolCallId: string | undefined,
    params: Record<string, unknown>,
  ): void {
    if (conversation.isAborted || conversation.status === "aborted") {
      return;
    }

    const updateTime = this.getOrCreateToolDraftUpdateTime(conversation.id, toolName, toolCallId);
    const wsMessage: WebSocketMessage<SERVER_SEND_MESSAGE_NAME> = {
      type: messageType as SERVER_SEND_MESSAGE_NAME,
      data: {
        message: JSON.stringify({
          params,
          toolName,
          toolCallId,
        }),
        partial: true,
        updateTime,
        taskId: conversation.id,
      },
    };

    broadcaster.broadcast(conversation.id, wsMessage);
    conversation.memory.addWebsocketMessage(wsMessage);
  }

  consumeToolDraftUpdateTime(
    conversationId: string,
    toolName: string,
    toolCallId?: string,
  ): number | undefined {
    const key = this.getToolCallKey(conversationId, toolName, toolCallId);
    const updateTime = this.toolCallDraftUpdateTimes.get(key);
    this.toolCallDraftUpdateTimes.delete(key);
    return updateTime;
  }

  cleanupToolDrafts(conversationId: string): void {
    const prefix = `${conversationId}:`;
    for (const key of this.toolCallDraftUpdateTimes.keys()) {
      if (key.startsWith(prefix)) {
        this.toolCallDraftUpdateTimes.delete(key);
      }
    }
  }

  private shouldSkipTextEmission(conversation: Conversation, message: string): boolean {
    return conversation.isAborted || conversation.status === "aborted" || isWhitespaceOnly(message);
  }

  private getToolCallKey(conversationId: string, toolName: string, toolCallId?: string): string {
    return `${conversationId}:${toolName}:${toolCallId || "no-call-id"}`;
  }

  private getOrCreateToolDraftUpdateTime(
    conversationId: string,
    toolName: string,
    toolCallId?: string,
  ): number {
    const key = this.getToolCallKey(conversationId, toolName, toolCallId);
    const existing = this.toolCallDraftUpdateTimes.get(key);
    if (typeof existing === "number") {
      return existing;
    }

    const created = Date.now();
    this.toolCallDraftUpdateTimes.set(key, created);
    return created;
  }
}
