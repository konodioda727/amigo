import type { ChatMessage, ContextUsageStatus } from "@amigo-llm/types";
import type { AmigoModelMessage } from "@/core/model";
import { resolveModelContextConfig } from "@/core/model/contextConfig";
import { getGlobalState } from "@/globalState";
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
  const toolCallSummary =
    message.toolCalls && message.toolCalls.length > 0
      ? `\n${JSON.stringify(message.toolCalls)}`
      : "";
  const toolResultSummary =
    message.role === "tool"
      ? `\n${message.toolName || ""}\n${message.toolCallId || ""}`.trim()
      : "";

  if (typeof message.content === "string") {
    return (
      6 +
      estimateTextTokens(message.content) +
      estimateTextTokens(toolCallSummary) +
      estimateTextTokens(toolResultSummary)
    );
  }

  const content = message.content
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      return `[${part.type}] ${part.name || ""} ${part.url}`.trim();
    })
    .join("\n");

  return (
    6 +
    estimateTextTokens(content) +
    estimateTextTokens(toolCallSummary) +
    estimateTextTokens(toolResultSummary)
  );
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
});

const getCompressionAnchorIndex = (messages: ChatMessage[]): number | null => {
  const index = messages.findLastIndex((message) => message.type === "compaction");
  return index >= 0 ? index : null;
};

const getMessagesForCurrentContext = (messages: ChatMessage[]): ChatMessage[] => {
  if (messages.length <= 1) {
    return [...messages];
  }

  const anchorIndex = getCompressionAnchorIndex(messages);
  if (anchorIndex === null) {
    return [...messages];
  }

  return messages.slice(anchorIndex);
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
    "你的任务是把一段多轮任务执行历史压缩成结构化摘要。",
    "保留这些信息：用户目标、关键约束、已完成动作、重要工具结果、失败与回退、当前事实、未决问题。",
    "不要杜撰，不要加入新计划，不要输出下一步建议。",
    "输出必须简洁但信息完整，便于后续模型结合摘要之后的近期消息继续任务。",
  ].join("\n");

const buildCompressionUserPrompt = (transcript: string): string =>
  [
    "请压缩下面这段历史会话。",
    "输出格式：",
    "1. 用户目标与约束",
    "2. 已完成动作与关键结果",
    "3. 当前已知事实",
    "4. 未决问题",
    "",
    transcript,
  ].join("\n");

const buildCompactionMessageContent = (summary: string): string =>
  [
    "以下是较早历史交互的低优先级摘要。",
    "仅在近期消息没有覆盖时参考；其后的近期消息、原始工具结果与最新用户输入优先级更高。",
    "",
    summary.trim(),
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
  keepBudgetTokens: number,
  preserveRecentMessages: number,
  minMessagesToCompress: number,
): CompressionSplit | null => {
  if (messages.length <= 2) {
    return null;
  }

  const anchorIndex = getCompressionAnchorIndex(messages) ?? 0;
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

const buildContextUsageSnapshot = (
  conversation: Conversation,
  ephemeralMessages: ChatMessage[] = [],
): {
  contextUsage: ContextUsageStatus;
  modelMessages: AmigoModelMessage[];
} | null => {
  const config =
    conversation.llm.contextWindow && conversation.llm.contextWindow > 0
      ? {
          model: conversation.llm.model,
          configId: conversation.llm.configId || "runtime",
          provider: conversation.llm.provider || "openai-compatible",
          apiKey: "",
          contextWindow: conversation.llm.contextWindow,
          thinkType: conversation.llm.thinkType,
          compressionThreshold: 0.8,
          targetRatio: 0.5,
          preserveRecentMessages: 8,
          minMessagesToCompress: 4,
        }
      : resolveModelContextConfig({
          model: conversation.llm.model,
          ...(conversation.llm.configId ? { configId: conversation.llm.configId } : {}),
        });
  if (!config) {
    return null;
  }

  const selectedMessages = [
    ...getMessagesForCurrentContext(conversation.memory.messages),
    ...ephemeralMessages,
  ];
  const modelMessages = toModelMessages(
    selectedMessages,
    conversation.llm,
    conversation.memory.initialSystemPrompt,
  );
  const estimatedTokens = estimateModelMessagesTokens(modelMessages);

  return {
    modelMessages,
    contextUsage: buildContextUsage({
      conversation,
      estimatedTokens,
      contextWindow: config.contextWindow,
      compressionThreshold: config.compressionThreshold,
      targetRatio: config.targetRatio,
      isCompressing: conversation.memory.contextUsage?.isCompressing || false,
      compressionCount: conversation.memory.contextUsage?.compressionCount || 0,
      lastCompressionAt: conversation.memory.contextUsage?.lastCompressionAt,
    }),
  };
};

export class ContextCompressionManager {
  syncContextUsage(conversation: Conversation): void {
    const snapshot = buildContextUsageSnapshot(conversation);
    if (!snapshot) {
      if (conversation.memory.contextUsage) {
        conversation.setContextUsage(undefined);
      }
      return;
    }

    conversation.setContextUsage(snapshot.contextUsage);
  }

  async prepareMessages(
    conversation: Conversation,
    signal?: AbortSignal,
    ephemeralMessages: ChatMessage[] = [],
  ): Promise<AmigoModelMessage[]> {
    const memoryRuntime = getGlobalState("memoryRuntime");
    const memoryContextMessages = memoryRuntime
      ? await memoryRuntime.buildContextMessages(conversation)
      : [];
    const mergedEphemeralMessages = [
      ...memoryContextMessages.map((entry) => entry.message),
      ...ephemeralMessages,
    ];
    const snapshot = buildContextUsageSnapshot(conversation, mergedEphemeralMessages);
    if (!snapshot) {
      if (conversation.memory.contextUsage) {
        conversation.setContextUsage(undefined);
      }
      const selectedMessages = [
        ...getMessagesForCurrentContext(conversation.memory.messages),
        ...mergedEphemeralMessages,
      ];
      return toModelMessages(
        selectedMessages,
        conversation.llm,
        conversation.memory.initialSystemPrompt,
      );
    }

    const config =
      conversation.llm.contextWindow && conversation.llm.contextWindow > 0
        ? {
            model: conversation.llm.model,
            configId: conversation.llm.configId || "runtime",
            provider: conversation.llm.provider || "openai-compatible",
            apiKey: "",
            contextWindow: conversation.llm.contextWindow,
            thinkType: conversation.llm.thinkType,
            compressionThreshold: 0.8,
            targetRatio: 0.5,
            preserveRecentMessages: 8,
            minMessagesToCompress: 4,
          }
        : resolveModelContextConfig({
            model: conversation.llm.model,
            ...(conversation.llm.configId ? { configId: conversation.llm.configId } : {}),
          });
    if (!config) {
      return snapshot.modelMessages;
    }
    let selectedMessages = [
      ...getMessagesForCurrentContext(conversation.memory.messages),
      ...mergedEphemeralMessages,
    ];
    let modelMessages = snapshot.modelMessages;
    let contextUsage = {
      ...snapshot.contextUsage,
      isCompressing: false,
    };
    conversation.setContextUsage(contextUsage);
    if (contextUsage.usageRatio < config.compressionThreshold) {
      return modelMessages;
    }

    const split = decideCompressionSplit(
      conversation.memory.messages,
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

      conversation.memory.insertMessageAt(split.keepStartIndex, {
        role: "user",
        type: "compaction",
        content: buildCompactionMessageContent(summary),
        partial: false,
      });

      selectedMessages = [
        ...getMessagesForCurrentContext(conversation.memory.messages),
        ...mergedEphemeralMessages,
      ];
      modelMessages = toModelMessages(
        selectedMessages,
        conversation.llm,
        conversation.memory.initialSystemPrompt,
      );
      const estimatedTokens = estimateModelMessagesTokens(modelMessages);

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
  buildContextUsageSnapshot,
  decideCompressionSplit,
  estimateChatMessageTokens,
  estimateModelMessagesTokens,
  getMessagesForCurrentContext,
};
