import type { ChatMessage } from "@amigo-llm/types";

type MinimalConversation = {
  memory: {
    messages: ChatMessage[];
    lastMessage?: ChatMessage;
  };
};

type CompleteTaskPayload = {
  toolName?: string;
  params?: {
    result?: string;
  };
};

export const extractCompletedSubTaskResultFromMessages = (
  messages: ChatMessage[],
): string | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type !== "tool" || message?.role !== "assistant") {
      continue;
    }

    try {
      const parsed = JSON.parse(message.content || "") as CompleteTaskPayload;
      if (parsed.toolName === "completeTask" && typeof parsed.params?.result === "string") {
        return parsed.params.result;
      }
    } catch {
      // Ignore malformed tool payloads and keep scanning older messages.
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      message?.role === "assistant" &&
      typeof message.content === "string" &&
      message.content.trim()
    ) {
      return message.content;
    }
  }

  return null;
};

export const extractCompletedSubTaskResult = (conversation: MinimalConversation): string | null => {
  return extractCompletedSubTaskResultFromMessages(conversation.memory.messages);
};
