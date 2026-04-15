import type { ChatMessage } from "@amigo-llm/types";

type MinimalConversation = {
  memory: {
    messages: ChatMessage[];
    lastMessage?: ChatMessage;
  };
};

export type CompleteTaskPayload = {
  toolName?: string;
  params?: {
    summary?: string;
    result?: string;
    achievements?: string;
    usage?: string;
  };
};

export type CompletedExecutionTaskPayload = {
  summary?: string;
  result?: string;
  achievements?: string;
  usage?: string;
};

type MinimalPendingToolConversation = {
  pendingToolCall?: {
    toolName?: string;
    params?: {
      summary?: string;
      result?: string;
      achievements?: string;
      usage?: string;
    };
  } | null;
};

const REQUIRED_RESULT_SECTIONS = ["交付物", "验证", "遗留问题", "下游说明"] as const;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractMarkdownSection = (content: string, heading: string): string => {
  const pattern = new RegExp(
    `(?:^|\\n)##\\s*${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    "i",
  );
  const match = pattern.exec(content);
  return match?.[1]?.trim() || "";
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const extractPayloadFromRecord = (value: unknown): CompletedExecutionTaskPayload | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const payload: CompletedExecutionTaskPayload = {
    summary: typeof record.summary === "string" ? record.summary : undefined,
    result: typeof record.result === "string" ? record.result : undefined,
    achievements: typeof record.achievements === "string" ? record.achievements : undefined,
    usage: typeof record.usage === "string" ? record.usage : undefined,
  };

  if (payload.summary || payload.result || payload.achievements || payload.usage) {
    return payload;
  }

  return null;
};

const getLatestExecutionTurnMessages = (messages: ChatMessage[]): ChatMessage[] => {
  const lastUserTurnIndex = messages.findLastIndex(
    (message) => message.role === "user" && message.type === "userSendMessage",
  );

  return lastUserTurnIndex >= 0 ? messages.slice(lastUserTurnIndex) : messages;
};

export const extractCompletedExecutionTaskPayloadFromMessages = (
  messages: ChatMessage[],
): CompletedExecutionTaskPayload | null => {
  const currentTurnMessages = getLatestExecutionTurnMessages(messages);

  for (let i = currentTurnMessages.length - 1; i >= 0; i--) {
    const message = currentTurnMessages[i];
    if (message?.type !== "tool" || message?.role !== "assistant") {
      continue;
    }

    try {
      const parsed = JSON.parse(message.content || "") as
        | CompleteTaskPayload
        | {
            kind?: string;
            toolName?: string;
            arguments?: Record<string, unknown>;
          };

      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.kind === "assistant_tool_call" &&
        parsed.toolName === "completeTask"
      ) {
        const transcriptPayload = extractPayloadFromRecord(parsed.arguments);
        if (transcriptPayload) {
          return transcriptPayload;
        }
      }

      if ("toolName" in parsed && parsed.toolName === "completeTask") {
        const payload = extractPayloadFromRecord(parsed.params);
        if (payload) {
          return payload;
        }
      }
    } catch {
      // Ignore malformed tool payloads and keep scanning older messages.
    }
  }

  for (let i = currentTurnMessages.length - 1; i >= 0; i--) {
    const message = currentTurnMessages[i];
    if (
      message?.role === "assistant" &&
      typeof message.content === "string" &&
      message.content.trim()
    ) {
      return {
        result: message.content,
      };
    }
  }

  return null;
};

export const extractCompletedExecutionTaskResultFromMessages = (
  messages: ChatMessage[],
): string | null => {
  const payload = extractCompletedExecutionTaskPayloadFromMessages(messages);
  return payload?.result || null;
};

export const extractCompletedExecutionTaskResult = (
  conversation: MinimalConversation,
): string | null => {
  return extractCompletedExecutionTaskResultFromMessages(conversation.memory.messages);
};

export const extractCompletedExecutionTaskPayload = (
  conversation: MinimalConversation,
): CompletedExecutionTaskPayload | null => {
  return extractCompletedExecutionTaskPayloadFromMessages(conversation.memory.messages);
};

export const extractPendingCompleteTaskPayload = (
  conversation: MinimalPendingToolConversation,
): CompletedExecutionTaskPayload | null => {
  const pending = conversation.pendingToolCall;
  if (!pending || pending.toolName !== "completeTask") {
    return null;
  }

  const payload: CompletedExecutionTaskPayload = {
    summary: typeof pending.params?.summary === "string" ? pending.params.summary : undefined,
    result: typeof pending.params?.result === "string" ? pending.params.result : undefined,
    achievements:
      typeof pending.params?.achievements === "string" ? pending.params.achievements : undefined,
    usage: typeof pending.params?.usage === "string" ? pending.params.usage : undefined,
  };

  if (payload.summary || payload.result || payload.achievements || payload.usage) {
    return payload;
  }

  return null;
};

export const formatCompletedExecutionTaskPayload = (
  payload: CompletedExecutionTaskPayload,
): string => {
  const sections = [
    payload.summary?.trim() ? `### 摘要\n${payload.summary.trim()}` : "",
    payload.result?.trim() ? payload.result.trim() : "",
    payload.achievements?.trim() ? `### 成果\n${payload.achievements.trim()}` : "",
    payload.usage?.trim() ? `### 使用说明\n${payload.usage.trim()}` : "",
  ].filter(Boolean);

  return sections.join("\n\n").trim();
};

export const validateCompletedExecutionTaskPayload = (
  payload: CompletedExecutionTaskPayload | null,
): {
  ok: boolean;
  reason?: string;
  details: string[];
} => {
  const details: string[] = [];

  if (!payload) {
    details.push("未找到 completeTask 交付内容。");
  } else {
    if (!payload.summary?.trim()) {
      details.push("缺少 `summary`。");
    }

    const result = payload.result?.trim() || "";
    if (!result) {
      details.push("缺少 `result`。");
    } else {
      for (const heading of REQUIRED_RESULT_SECTIONS) {
        const sectionContent = extractMarkdownSection(result, heading);
        if (!sectionContent) {
          details.push(`result 缺少非空章节 \`## ${heading}\`。`);
        }
      }
    }
  }

  if (details.length === 0) {
    return {
      ok: true,
      details: [],
    };
  }

  return {
    ok: false,
    reason: `未通过父任务自动验收：${details.join(" ")}`,
    details,
  };
};
