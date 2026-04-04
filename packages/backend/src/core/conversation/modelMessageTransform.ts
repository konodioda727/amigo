import type { ChatMessage, UserMessageAttachment } from "@amigo-llm/types";
import type { AmigoLlm, AmigoMessageContentPart, AmigoModelMessage } from "@/core/model";
import { appendRuntimeDateTimeContextToUserInput } from "./runtimeDateTimeContext";
import {
  buildAssistantToolCallFallbackText,
  buildToolResultFallbackText,
  isEquivalentToolInteraction,
  parseAssistantToolCallMessage,
  parseToolResultMessage,
  serializeToolResultPayloadForModel,
} from "./toolTranscript";

const isGoogleGenAIModel = (llm: AmigoLlm) => llm.provider === "google-genai";
const RECENT_TOOL_INTERACTIONS_TO_KEEP = 10;
const mergeableRoles = new Set<ChatMessage["role"]>(["user", "system"]);
const nonMergeableTypes = new Set<string>([
  "tool",
  "think",
  "interrupt",
  "askFollowupQuestion",
  "compaction",
]);
const plainTextLoopReminderPrefixes = [
  "提醒：本轮输出未调用任何工具",
  "提醒：你已经连续",
  "警告：你是一个子任务代理，必须使用工具来完成任务。",
];

const mergeTextContent = (left: string, right: string): string => {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();
  if (normalizedLeft && normalizedRight) {
    return `${normalizedLeft}\n\n${normalizedRight}`;
  }
  return normalizedLeft || normalizedRight;
};

const shouldDropSystemNoiseMessage = (message: ChatMessage): boolean => {
  if (message.role !== "system" || message.type !== "message") {
    return false;
  }

  const trimmedContent = message.content.trim();
  return plainTextLoopReminderPrefixes.some((prefix) => trimmedContent.startsWith(prefix));
};

const mergeConsecutiveMessages = (messages: ChatMessage[]): ChatMessage[] => {
  const merged: ChatMessage[] = [];

  for (const message of messages) {
    const previous = merged.at(-1);
    const canMerge =
      previous &&
      previous.role === message.role &&
      previous.type === message.type &&
      mergeableRoles.has(message.role) &&
      !previous.partial &&
      !message.partial &&
      !nonMergeableTypes.has(previous.type) &&
      !nonMergeableTypes.has(message.type);

    if (!canMerge) {
      merged.push({
        ...message,
        attachments: message.attachments ? [...message.attachments] : undefined,
      });
      continue;
    }

    const attachments = [...(previous.attachments || []), ...(message.attachments || [])];
    merged[merged.length - 1] = {
      ...previous,
      content: mergeTextContent(previous.content, message.content),
      attachments: attachments.length > 0 ? attachments : undefined,
      updateTime:
        Math.max(previous.updateTime ?? 0, message.updateTime ?? 0) ||
        previous.updateTime ||
        message.updateTime,
    };
  }

  return merged;
};

const cloneMessage = (message: ChatMessage): ChatMessage => ({
  ...message,
  attachments: message.attachments ? [...message.attachments] : undefined,
});

const buildAssistantToolPlaceholderMessage = (
  toolName: string,
  updateTime?: number,
): ChatMessage => ({
  role: "assistant",
  type: "message",
  content: `【已调用 ${toolName} 工具】`,
  partial: false,
  updateTime,
});

const buildToolResultPlaceholderMessage = (toolName: string, updateTime?: number): ChatMessage => ({
  role: "user",
  type: "message",
  content: `【${toolName} 工具已返回结果】`,
  partial: false,
  updateTime,
});

const collapseConsecutiveToolInteractions = (messages: ChatMessage[]): ChatMessage[] => {
  const collapsed: ChatMessage[] = [];

  for (let index = 0; index < messages.length; ) {
    const toolCallMessage = messages[index];
    const toolResultMessage = messages[index + 1];
    const toolCallPayload = toolCallMessage ? parseAssistantToolCallMessage(toolCallMessage) : null;
    const toolResultPayload = toolResultMessage ? parseToolResultMessage(toolResultMessage) : null;

    if (!toolCallPayload || !toolResultPayload) {
      if (toolCallMessage) {
        collapsed.push(cloneMessage(toolCallMessage));
      }
      index += 1;
      continue;
    }

    const previousToolCallMessage = collapsed.at(-2);
    const previousToolResultMessage = collapsed.at(-1);
    const previousToolCallPayload = previousToolCallMessage
      ? parseAssistantToolCallMessage(previousToolCallMessage)
      : null;
    const previousToolResultPayload = previousToolResultMessage
      ? parseToolResultMessage(previousToolResultMessage)
      : null;

    if (
      previousToolCallPayload &&
      previousToolResultPayload &&
      toolCallMessage &&
      toolResultMessage &&
      isEquivalentToolInteraction(
        previousToolCallPayload,
        previousToolResultPayload,
        toolCallPayload,
        toolResultPayload,
      )
    ) {
      collapsed.splice(
        collapsed.length - 2,
        2,
        cloneMessage(toolCallMessage),
        cloneMessage(toolResultMessage),
      );
    } else if (toolCallMessage && toolResultMessage) {
      collapsed.push(cloneMessage(toolCallMessage), cloneMessage(toolResultMessage));
    }

    index += 2;
  }

  return collapsed;
};

type ToolInteractionUnit = {
  startIndex: number;
  endIndex: number;
  toolName: string;
  kind: "pair" | "call" | "result";
};

const isMatchingToolInteraction = (
  toolCallPayload: NonNullable<ReturnType<typeof parseAssistantToolCallMessage>>,
  toolResultPayload: NonNullable<ReturnType<typeof parseToolResultMessage>>,
): boolean => {
  if (toolCallPayload.toolName !== toolResultPayload.toolName) {
    return false;
  }

  if (toolCallPayload.toolCallId && toolResultPayload.toolCallId) {
    return toolCallPayload.toolCallId === toolResultPayload.toolCallId;
  }

  return true;
};

const collectToolInteractionUnits = (messages: ChatMessage[]): ToolInteractionUnit[] => {
  const units: ToolInteractionUnit[] = [];

  for (let index = 0; index < messages.length; ) {
    const currentMessage = messages[index];
    const assistantToolCall = currentMessage ? parseAssistantToolCallMessage(currentMessage) : null;

    if (assistantToolCall) {
      const nextMessage = messages[index + 1];
      const toolResult = nextMessage ? parseToolResultMessage(nextMessage) : null;

      if (toolResult && isMatchingToolInteraction(assistantToolCall, toolResult)) {
        units.push({
          startIndex: index,
          endIndex: index + 1,
          toolName: assistantToolCall.toolName,
          kind: "pair",
        });
        index += 2;
        continue;
      }

      units.push({
        startIndex: index,
        endIndex: index,
        toolName: assistantToolCall.toolName,
        kind: "call",
      });
      index += 1;
      continue;
    }

    const toolResult = currentMessage ? parseToolResultMessage(currentMessage) : null;
    if (toolResult) {
      units.push({
        startIndex: index,
        endIndex: index,
        toolName: toolResult.toolName,
        kind: "result",
      });
    }

    index += 1;
  }

  return units;
};

const collapseOlderToolInteractionsToPlaceholders = (
  messages: ChatMessage[],
  keepRecentInteractions: number = RECENT_TOOL_INTERACTIONS_TO_KEEP,
): ChatMessage[] => {
  const units = collectToolInteractionUnits(messages);
  if (units.length <= keepRecentInteractions) {
    return messages.map(cloneMessage);
  }

  const detailStartIndex = Math.max(0, units.length - keepRecentInteractions);
  const unitByStartIndex = new Map(
    units.map((unit, index) => [unit.startIndex, { ...unit, index }]),
  );
  const transformed: ChatMessage[] = [];

  for (let index = 0; index < messages.length; ) {
    const unit = unitByStartIndex.get(index);
    if (!unit) {
      const message = messages[index];
      if (message) {
        transformed.push(cloneMessage(message));
      }
      index += 1;
      continue;
    }

    if (unit.index >= detailStartIndex) {
      for (let cursor = unit.startIndex; cursor <= unit.endIndex; cursor++) {
        const message = messages[cursor];
        if (message) {
          transformed.push(cloneMessage(message));
        }
      }
      index = unit.endIndex + 1;
      continue;
    }

    const startMessage = messages[unit.startIndex];
    const endMessage = messages[unit.endIndex];

    if (unit.kind === "pair" || unit.kind === "call") {
      transformed.push(
        buildAssistantToolPlaceholderMessage(unit.toolName, startMessage?.updateTime),
      );
    }
    if (unit.kind === "pair" || unit.kind === "result") {
      transformed.push(buildToolResultPlaceholderMessage(unit.toolName, endMessage?.updateTime));
    }
    index = unit.endIndex + 1;
  }

  return transformed;
};

const injectRuntimeDateTimeContext = (messages: ChatMessage[]): ChatMessage[] => {
  const lastUserIndex = messages.findLastIndex(
    (message) =>
      message.role === "user" && message.type !== "tool" && message.type !== "compaction",
  );
  if (lastUserIndex < 0) {
    return messages;
  }

  const runtimeContextTime = new Date(messages[lastUserIndex]?.updateTime ?? Date.now());
  return messages.map((message, index) =>
    index === lastUserIndex
      ? {
          ...message,
          content: appendRuntimeDateTimeContextToUserInput(message.content, runtimeContextTime),
        }
      : message,
  );
};

const toAttachmentContentBlock = (attachment: UserMessageAttachment): AmigoMessageContentPart => {
  const common = {
    mimeType: attachment.mimeType,
    url: attachment.url,
    name: attachment.name,
    size: attachment.size,
  };

  switch (attachment.kind) {
    case "image":
      return { type: "image", ...common };
    case "audio":
      return { type: "audio", ...common };
    case "video":
      return { type: "video", ...common };
    default:
      return { type: "file", ...common };
  }
};

const toHumanMessageContent = (message: ChatMessage): string | AmigoMessageContentPart[] => {
  if (!message.attachments || message.attachments.length === 0) {
    return message.content;
  }

  const blocks: AmigoMessageContentPart[] = [];
  if (message.content.trim()) {
    blocks.push({ type: "text", text: message.content });
  }

  for (const attachment of message.attachments) {
    blocks.push(toAttachmentContentBlock(attachment));
  }

  return blocks;
};

export const toModelMessages = (
  messages: ChatMessage[],
  llm: AmigoLlm,
  initialSystemPrompt?: string,
): AmigoModelMessage[] => {
  const normalizedMessages = collapseOlderToolInteractionsToPlaceholders(
    injectRuntimeDateTimeContext(
      collapseConsecutiveToolInteractions(
        mergeConsecutiveMessages(
          messages.filter((message) => !shouldDropSystemNoiseMessage(message)),
        ),
      ),
    ),
  );
  const promptPrefixedMessages = initialSystemPrompt?.trim()
    ? [
        {
          role: "system",
          type: "system",
          content: initialSystemPrompt.trim(),
        } satisfies ChatMessage,
        ...normalizedMessages,
      ]
    : normalizedMessages;

  if (isGoogleGenAIModel(llm)) {
    let firstSystemContent: string | null = null;
    const transformed: AmigoModelMessage[] = [];

    for (const message of promptPrefixedMessages) {
      const assistantToolCall = parseAssistantToolCallMessage(message);
      if (assistantToolCall) {
        transformed.push({
          role: "assistant",
          content: buildAssistantToolCallFallbackText(assistantToolCall),
        });
        continue;
      }

      const toolResult = parseToolResultMessage(message);
      if (toolResult) {
        transformed.push({
          role: "user",
          content: buildToolResultFallbackText(toolResult),
        });
        continue;
      }

      if (message.role === "system") {
        if (!firstSystemContent) {
          firstSystemContent = message.content;
          continue;
        }
        transformed.push({
          role: "user",
          content: `SYSTEM NOTICE:\n${message.content}`,
        });
        continue;
      }

      if (message.role === "assistant") {
        transformed.push({ role: "assistant", content: message.content });
        continue;
      }

      transformed.push({
        role: "user",
        content: toHumanMessageContent(message),
      });
    }

    if (firstSystemContent) {
      return [{ role: "system", content: firstSystemContent }, ...transformed];
    }

    return transformed;
  }

  return promptPrefixedMessages.map((message): AmigoModelMessage => {
    const assistantToolCall = parseAssistantToolCallMessage(message);
    if (assistantToolCall) {
      return {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: assistantToolCall.toolCallId,
            name: assistantToolCall.toolName,
            arguments: assistantToolCall.arguments,
          },
        ],
      };
    }

    const toolResult = parseToolResultMessage(message);
    if (toolResult) {
      return {
        role: "tool",
        content: serializeToolResultPayloadForModel(toolResult),
        toolCallId: toolResult.toolCallId,
        toolName: toolResult.toolName,
      };
    }

    switch (message.role) {
      case "system":
        return { role: "system", content: message.content };
      case "assistant":
        return { role: "assistant", content: message.content };
      default:
        return { role: "user", content: toHumanMessageContent(message) };
    }
  });
};
