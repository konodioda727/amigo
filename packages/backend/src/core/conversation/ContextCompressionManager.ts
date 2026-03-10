import type { ChatMessage, ContextUsageStatus } from "@amigo-llm/types";
import type { AmigoModelMessage } from "@/core/model";
import { resolveModelContextConfig } from "@/core/model/contextConfig";
import { logger } from "@/utils/logger";
import type { Conversation } from "./Conversation";
import { toModelMessages } from "./modelMessageTransform";
import { broadcaster } from "./WebSocketBroadcaster";

const ESTIMATED_CHARS_PER_TOKEN = 4;

const getAttachmentSummary = (message: ChatMessage): string => {
  if (!message.attachments || message.attachments.length === 0) {
    return "";
  }

  return message.attachments
    .map((attachment) => {
      const name = attachment.name?.trim() || "unnamed";
      return `[${attachment.kind}] ${name} ${attachment.url}`.trim();
    })
    .join("\n");
};

const estimateTextTokens = (value: string): number => {
  if (!value.trim()) {
    return 0;
  }
  return Math.ceil(value.length / ESTIMATED_CHARS_PER_TOKEN);
};

const estimateChatMessageTokens = (message: ChatMessage): number => {
  const content = message.content;
  const attachmentSummary = getAttachmentSummary(message);
  return 6 + estimateTextTokens(content) + estimateTextTokens(attachmentSummary);
};

const estimateModelMessageTokens = (message: AmigoModelMessage): number => {
  if (typeof message.content === "string") {
    return 6 + estimateTextTokens(message.content);
  }

  const content = message.content
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      return `[${part.type}] ${part.name || ""} ${part.url}`.trim();
    })
    .join("\n");

  return 6 + estimateTextTokens(content);
};

const estimateModelMessagesTokens = (messages: AmigoModelMessage[]): number =>
  messages.reduce((sum, message) => sum + estimateModelMessageTokens(message), 0);

const formatRatio = (ratio: number): string => `${Math.round(ratio * 100)}%`;

const clampRatio = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const buildContextUsage = (params: {
  conversation: Conversation;
  estimatedTokens: number;
  contextWindow: number;
  compressionThreshold: number;
  targetRatio: number;
  isCompressing: boolean;
  compressionCount: number;
  lastCompressionAt?: string;
  compressionAnchorUpdateTime?: number;
}): ContextUsageStatus => ({
  model: params.conversation.llm.model,
  contextWindow: params.contextWindow,
  estimatedTokens: params.estimatedTokens,
  usageRatio: clampRatio(params.estimatedTokens / params.contextWindow),
  compressionThreshold: params.compressionThreshold,
  targetRatio: params.targetRatio,
  isCompressing: params.isCompressing,
  compressionCount: params.compressionCount,
  lastCompressionAt: params.lastCompressionAt,
  compressionAnchorUpdateTime: params.compressionAnchorUpdateTime,
});

const getCompressionAnchorIndex = (
  messages: ChatMessage[],
  anchorUpdateTime?: number,
): number | null => {
  if (typeof anchorUpdateTime !== "number") {
    return null;
  }

  const index = messages.findIndex((message) => message.updateTime === anchorUpdateTime);
  return index >= 1 ? index : null;
};

const getMessagesForCurrentContext = (
  messages: ChatMessage[],
  anchorUpdateTime?: number,
): ChatMessage[] => {
  if (messages.length <= 1) {
    return [...messages];
  }

  const firstMessage = messages[0];
  if (!firstMessage) {
    return [];
  }

  const anchorIndex = getCompressionAnchorIndex(messages, anchorUpdateTime);
  if (anchorIndex === null) {
    return [...messages];
  }

  return [firstMessage, ...messages.slice(anchorIndex)];
};

const buildCompressionTranscript = (messages: ChatMessage[]): string =>
  messages
    .map((message, index) => {
      const content = message.content.trim() || "(empty)";
      const attachmentSummary = getAttachmentSummary(message);
      const attachmentBlock = attachmentSummary ? `\nAttachments:\n${attachmentSummary}` : "";
      return `#${index + 1} [role=${message.role}] [type=${message.type}]\n${content}${attachmentBlock}`;
    })
    .join("\n\n---\n\n");

const buildCompressionSystemPrompt = (): string =>
  [
    "你是一个对话上下文压缩器。",
    "你的任务是把一段多轮任务执行历史压缩成可继续执行任务的上下文摘要。",
    "保留这些信息：用户目标、关键约束、已完成动作、重要工具结果、失败与回退、当前待办、未解决问题。",
    "不要杜撰，不要加入新计划，不要输出 markdown 标题层级过深。",
    "输出必须简洁但信息完整，便于后续模型直接继续任务。",
  ].join("\n");

const buildCompressionUserPrompt = (transcript: string): string =>
  [
    "请压缩下面这段历史会话。",
    "输出格式：",
    "1. 目标与约束",
    "2. 已完成事项",
    "3. 当前状态",
    "4. 下一步",
    "",
    transcript,
  ].join("\n");

const emitCompressionAlert = (
  conversation: Conversation,
  message: string,
  severity: "info" | "warning" | "error" | "success",
): void => {
  broadcaster.emitAndSave(conversation, {
    type: "alert",
    data: {
      message,
      severity,
      updateTime: Date.now(),
    },
  });
};

type CompressionSplit = {
  anchorIndex: number;
  keepStartIndex: number;
  messagesToCompress: ChatMessage[];
};

const decideCompressionSplit = (
  messages: ChatMessage[],
  anchorUpdateTime: number | undefined,
  keepBudgetTokens: number,
  preserveRecentMessages: number,
  minMessagesToCompress: number,
): CompressionSplit | null => {
  if (messages.length <= 2) {
    return null;
  }

  const anchorIndex = getCompressionAnchorIndex(messages, anchorUpdateTime) ?? 1;
  if (anchorIndex >= messages.length - 1) {
    return null;
  }

  let keptCount = 0;
  let keptTokens = 0;

  for (let index = messages.length - 1; index >= anchorIndex; index--) {
    const candidateMessage = messages[index];
    if (!candidateMessage) {
      continue;
    }
    const messageTokens = estimateChatMessageTokens(candidateMessage);
    const shouldKeepByMinimum = keptCount < preserveRecentMessages;
    const canKeepWithinBudget = keptTokens + messageTokens <= keepBudgetTokens;

    if (shouldKeepByMinimum || canKeepWithinBudget) {
      keptTokens += messageTokens;
      keptCount += 1;
      continue;
    }

    break;
  }

  const keepStartIndex = messages.length - keptCount;
  const compressedCount = keepStartIndex - anchorIndex;
  if (compressedCount < minMessagesToCompress) {
    return null;
  }

  return {
    anchorIndex,
    keepStartIndex,
    messagesToCompress: messages.slice(anchorIndex, keepStartIndex),
  };
};

const streamSummaryText = async (
  conversation: Conversation,
  messages: AmigoModelMessage[],
  signal?: AbortSignal,
): Promise<string> => {
  const stream = await conversation.llm.stream(messages, { signal });
  let summary = "";

  for await (const event of stream) {
    if (event.type === "text_delta" && event.text) {
      summary += event.text;
    }
  }

  return summary.trim();
};

export class ContextCompressionManager {
  async prepareMessages(
    conversation: Conversation,
    signal?: AbortSignal,
  ): Promise<AmigoModelMessage[]> {
    const config = resolveModelContextConfig(conversation.llm.model);
    if (!config) {
      if (conversation.memory.contextUsage) {
        conversation.setContextUsage(undefined);
      }
      return toModelMessages(conversation.memory.messages, conversation.llm);
    }

    let selectedMessages = getMessagesForCurrentContext(
      conversation.memory.messages,
      conversation.memory.contextUsage?.compressionAnchorUpdateTime,
    );
    let modelMessages = toModelMessages(selectedMessages, conversation.llm);
    let estimatedTokens = estimateModelMessagesTokens(modelMessages);
    let contextUsage = buildContextUsage({
      conversation,
      estimatedTokens,
      contextWindow: config.contextWindow,
      compressionThreshold: config.compressionThreshold,
      targetRatio: config.targetRatio,
      isCompressing: false,
      compressionCount: conversation.memory.contextUsage?.compressionCount || 0,
      lastCompressionAt: conversation.memory.contextUsage?.lastCompressionAt,
      compressionAnchorUpdateTime: conversation.memory.contextUsage?.compressionAnchorUpdateTime,
    });

    conversation.setContextUsage(contextUsage);
    if (contextUsage.usageRatio < config.compressionThreshold) {
      return modelMessages;
    }

    const split = decideCompressionSplit(
      conversation.memory.messages,
      conversation.memory.contextUsage?.compressionAnchorUpdateTime,
      Math.floor(config.contextWindow * config.targetRatio),
      config.preserveRecentMessages,
      config.minMessagesToCompress,
    );
    if (!split) {
      return modelMessages;
    }

    emitCompressionAlert(
      conversation,
      `上下文占用达到 ${formatRatio(contextUsage.usageRatio)}，开始压缩历史上下文。`,
      "info",
    );

    contextUsage = {
      ...contextUsage,
      isCompressing: true,
    };
    conversation.setContextUsage(contextUsage);

    try {
      const transcript = buildCompressionTranscript(split.messagesToCompress);
      const summary = await streamSummaryText(
        conversation,
        [
          {
            role: "system",
            content: buildCompressionSystemPrompt(),
          },
          {
            role: "user",
            content: buildCompressionUserPrompt(transcript),
          },
        ],
        signal,
      );

      if (!summary) {
        throw new Error("压缩摘要为空");
      }

      broadcaster.persistMessageOnly(conversation, {
        role: "assistant",
        type: "message",
        content: "以下是此前会话的压缩摘要，请将其视为已经确认的事实背景并据此继续：\n" + summary,
        partial: false,
      });

      const anchorUpdateTime = conversation.memory.lastMessage?.updateTime;
      selectedMessages = getMessagesForCurrentContext(
        conversation.memory.messages,
        anchorUpdateTime,
      );
      modelMessages = toModelMessages(selectedMessages, conversation.llm);
      estimatedTokens = estimateModelMessagesTokens(modelMessages);

      const completedAt = new Date().toISOString();
      contextUsage = buildContextUsage({
        conversation,
        estimatedTokens,
        contextWindow: config.contextWindow,
        compressionThreshold: config.compressionThreshold,
        targetRatio: config.targetRatio,
        isCompressing: false,
        compressionCount: (conversation.memory.contextUsage?.compressionCount || 0) + 1,
        lastCompressionAt: completedAt,
        compressionAnchorUpdateTime: anchorUpdateTime,
      });
      conversation.setContextUsage(contextUsage);

      emitCompressionAlert(
        conversation,
        `上下文压缩完成，当前占用 ${formatRatio(contextUsage.usageRatio)}。`,
        "success",
      );

      return modelMessages;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[ContextCompression] 压缩失败: ${message}`);

      conversation.setContextUsage({
        ...contextUsage,
        isCompressing: false,
      });
      emitCompressionAlert(
        conversation,
        `上下文压缩失败，本轮继续使用原始上下文。原因: ${message}`,
        "warning",
      );
      return modelMessages;
    }
  }
}

export const contextCompressionManager = new ContextCompressionManager();

export const __testing__ = {
  decideCompressionSplit,
  estimateChatMessageTokens,
  estimateModelMessagesTokens,
  getMessagesForCurrentContext,
};
