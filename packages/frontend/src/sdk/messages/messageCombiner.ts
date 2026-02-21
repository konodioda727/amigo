import type {
  SERVER_SEND_MESSAGE_NAME,
  ToolParams,
  ToolResult,
  TransportToolContent,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import type { CompletionResultType, DisplayMessageType, FrontendCommonMessageType } from "./types";
import { DisplayMessageTypeNames } from "./types";

type SupportedWebsocketMessage = WebSocketMessage<
  SERVER_SEND_MESSAGE_NAME | USER_SEND_MESSAGE_NAME
>;

type MessageProcessor<T extends SERVER_SEND_MESSAGE_NAME | USER_SEND_MESSAGE_NAME> = (params: {
  msg: WebSocketMessage<T>;
  res: DisplayMessageType[];
  pendingThink: WebSocketMessage<"think"> | null;
}) => { handled: boolean; pendingThink?: WebSocketMessage<"think"> | null };

const thinkProcessor: MessageProcessor<"think"> = ({ msg: thinkMsg, res }) => {
  if (thinkMsg.type !== "think") return { handled: false };
  const thinkData = thinkMsg.data;
  const thinkEntry: FrontendCommonMessageType = {
    message: "",
    think: thinkData.message ?? "",
    updateTime: thinkData.updateTime || Date.now(),
    type: "message",
  };
  const lastMessage = res.at(-1);
  if (isFrontendCommonMessage(lastMessage) && lastMessage.updateTime === thinkEntry.updateTime) {
    res[res.length - 1] = {
      ...lastMessage,
      think: thinkEntry.think ?? lastMessage.think,
    };
  } else {
    res.push(thinkEntry);
  }
  return { handled: true, pendingThink: thinkMsg };
};

const messageProcessor: MessageProcessor<"message"> = ({ msg, res, pendingThink }) => {
  if (msg.type !== "message") return { handled: false };
  const messageData = msg.data as WebSocketMessage<"message">["data"] & {
    think?: string;
  };
  const updateTime = messageData.updateTime || Date.now();
  const isPartial = messageData.partial ?? false;

  const messageEntry: FrontendCommonMessageType = {
    message: messageData.message ?? "",
    updateTime,
    type: "message",
    partial: isPartial,
  } as any;

  if (messageData.think) {
    messageEntry.think = messageData.think;
  } else if (pendingThink?.data?.message) {
    messageEntry.think = pendingThink.data.message;
  }

  const lastMessage = res.at(-1);
  // 合并条件：type 相同、updateTime 相同、前一个消息 partial 为 true
  const shouldMerge =
    isFrontendCommonMessage(lastMessage) &&
    lastMessage.updateTime === updateTime &&
    (lastMessage as any).partial === true;

  if (shouldMerge && isFrontendCommonMessage(lastMessage)) {
    res[res.length - 1] = {
      ...lastMessage,
      ...messageEntry,
      think: messageEntry.think ?? lastMessage.think,
    };
  } else {
    res.push(messageEntry);
  }
  return { handled: true, pendingThink: null };
};

const completionResultProcessor: MessageProcessor<"completionResult"> = ({ msg, res }) => {
  if (msg.type !== "completionResult") return { handled: false };
  const completionData = msg.data;

  let conclusion = "";
  try {
    const parsed = JSON.parse(completionData.message || "");
    conclusion = parsed?.params || "";
  } catch (error) {
    console.error("处理 completionResult 消息时出错:", error);
  }

  const updateTime = completionData.updateTime || Date.now();
  const isPartial = completionData.partial ?? false;

  // 检查是否应该合并：type 相同、updateTime 相同、前一个消息 partial 为 true
  const lastMessage = res.at(-1);
  if (
    lastMessage?.type === "completionResult" &&
    lastMessage.updateTime === updateTime &&
    (lastMessage as any).partial === true
  ) {
    // 合并消息：更新最后一条消息
    res[res.length - 1] = {
      type: "completionResult",
      result: conclusion || lastMessage.result,
      updateTime,
      partial: isPartial,
    } as any;
  } else {
    // 创建新消息
    const completionEntry: CompletionResultType = {
      result: conclusion,
      updateTime,
      type: "completionResult",
      partial: isPartial,
    } as any;
    res.push(completionEntry);
  }

  return { handled: true };
};

const toolProcessor: MessageProcessor<"tool"> = ({ msg, res }) => {
  if (msg.type !== "tool") return { handled: false };
  // 解析 tool 消息，结构化为 DisplayMessageType
  const parsed = JSON.parse(msg.data.message) as TransportToolContent<any> & { error?: string };
  const { toolName, params, result, error } = parsed;
  const updateTime = typeof msg.data.updateTime === "number" ? msg.data.updateTime : Date.now();
  const isPartial = msg.data.partial ?? false;

  // 查找是否已经有相同 toolName 和 updateTime 的 tool（用于合并 partial 消息）
  const lastMessage = res.at(-1);
  const shouldMerge =
    lastMessage?.type === "tool" &&
    lastMessage.toolName === toolName &&
    lastMessage.updateTime === updateTime &&
    (lastMessage as any).partial === true;

  if (shouldMerge && lastMessage?.type === "tool") {
    // 合并消息：更新最后一条 tool 消息
    // 特殊处理 assignTasks：需要保留已经添加的 taskId
    const mergedParams = (params as unknown as ToolParams<any>) || lastMessage.params;

    res[res.length - 1] = {
      type: "tool",
      toolName: lastMessage.toolName,
      params: mergedParams,
      toolOutput: result as unknown as ToolResult<any>,
      error: error,
      hasError: !!error,
      updateTime: lastMessage.updateTime,
      partial: isPartial,
    } as any;
  } else {
    // 创建新的 tool 条目
    res.push({
      type: "tool",
      toolName,
      params: params as unknown as ToolParams<any>,
      toolOutput: result as unknown as ToolResult<any>,
      error: error,
      hasError: !!error,
      updateTime,
      partial: isPartial,
    } as any);
  }

  return { handled: true };
};

const defaultProcessor: MessageProcessor<any> = ({ msg, res, pendingThink }) => {
  if (!DisplayMessageTypeNames.includes(msg.type)) return { handled: false };
  res.push(msg as unknown as DisplayMessageType);
  return { handled: true, pendingThink };
};

const userSendMessageProcessor: MessageProcessor<"userSendMessage"> = ({ msg, res }) => {
  if (msg.type !== "userSendMessage") return { handled: false };
  const userMsg = msg.data as {
    message: string;
    updateTime?: number;
    status?: "pending" | "acked" | "failed";
  };
  res.push({
    type: "userSendMessage",
    message: userMsg.message ?? "",
    updateTime: typeof userMsg.updateTime === "number" ? userMsg.updateTime : Date.now(),
    status: userMsg.status,
  });
  return { handled: true };
};

const askFollowupQuestionProcessor: MessageProcessor<"askFollowupQuestion"> = ({ msg, res }) => {
  if (msg.type !== "askFollowupQuestion") return { handled: false };

  const followupData = JSON.parse(msg.data.message)?.params as {
    question: string;
    suggestOptions: string[];
  };

  const updateTime = msg.data.updateTime || Date.now();
  const isPartial = msg.data.partial ?? false;

  // 检查是否应该合并：type 相同、updateTime 相同、前一个消息 partial 为 true
  const lastMessage = res.at(-1);
  if (
    lastMessage?.type === "askFollowupQuestion" &&
    lastMessage.updateTime === updateTime &&
    (lastMessage as any).partial === true
  ) {
    // 合并消息：更新最后一条消息
    res[res.length - 1] = {
      type: "askFollowupQuestion",
      question: followupData.question ?? lastMessage.question,
      sugestions: followupData.suggestOptions ?? lastMessage.sugestions,
      updateTime,
      partial: isPartial,
    } as any;
  } else {
    // 创建新消息
    res.push({
      type: "askFollowupQuestion",
      question: followupData.question ?? "",
      sugestions: followupData.suggestOptions ?? [],
      updateTime,
      partial: isPartial,
    } as any);
  }

  return { handled: true };
};

const interruptProcessor: MessageProcessor<"interrupt"> = ({ msg, res }) => {
  if (msg.type !== "interrupt") return { handled: false };

  // 移除最后一条 partial 消息（如果存在）
  const lastMessage = res.at(-1);
  if (lastMessage && (lastMessage as any).partial) {
    (lastMessage as any).partial = false;
  }

  res.push({
    type: "interrupt",
    updateTime: msg.data.updateTime || Date.now(),
  });
  return { handled: true };
};

const errorProcessor: MessageProcessor<"error"> = ({ msg, res }) => {
  if (msg.type !== "error") return { handled: false };

  res.push({
    type: "error",
    message: msg.data.message || "未知错误",
    updateTime: msg.data.updateTime || Date.now(),
  });
  return { handled: true };
};

const waitingToolCallProcessor: MessageProcessor<"waiting_tool_call"> = ({ msg, res }) => {
  if (msg.type !== "waiting_tool_call") return { handled: false };
  return { handled: true };
};

const processorMap: Partial<
  Record<SERVER_SEND_MESSAGE_NAME | USER_SEND_MESSAGE_NAME, MessageProcessor<any>>
> = {
  think: thinkProcessor,
  message: messageProcessor,
  userSendMessage: userSendMessageProcessor,
  completionResult: completionResultProcessor,
  tool: toolProcessor,
  askFollowupQuestion: askFollowupQuestionProcessor,
  interrupt: interruptProcessor,
  error: errorProcessor,
  waiting_tool_call: waitingToolCallProcessor,
};

export const combineMessages = (messages: SupportedWebsocketMessage[]): DisplayMessageType[] => {
  const res: DisplayMessageType[] = [];
  let pendingThink: WebSocketMessage<"think"> | null = null;

  for (const msg of messages) {
    // 特殊处理 taskHistory - 递归展开历史消息
    if (msg.type === "taskHistory") {
      const historyData = msg.data as { messages: SupportedWebsocketMessage[]; taskId: string };
      if (historyData.messages && Array.isArray(historyData.messages)) {
        const historicalMessages = combineMessages(historyData.messages);
        res.push(...historicalMessages);
      }
      continue;
    }

    const processor = processorMap[msg.type] ?? defaultProcessor;
    const { handled, pendingThink: newPendingThink } = processor({ msg, res, pendingThink });
    if (handled) {
      pendingThink = newPendingThink ?? pendingThink;
    }
  }

  // 后处理：为 askFollowupQuestion 设置 disabled 和 selectedOption
  postProcessAskFollowupQuestions(res);

  return res;
};

/**
 * 后处理 askFollowupQuestion 消息
 * - 非最后一条 askFollowupQuestion 设置 disabled
 * - 如果紧跟的用户消息匹配选项，设置 selectedOption
 */
const postProcessAskFollowupQuestions = (messages: DisplayMessageType[]) => {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type !== "askFollowupQuestion") continue;

    // 检查是否是最后一条消息
    const isLastMessage = i === messages.length - 1;

    // 查找紧跟的下一条用户消息
    const nextMsg = messages[i + 1];
    const nextUserMessage = nextMsg?.type === "userSendMessage" ? nextMsg.message : null;

    // 检查用户消息是否匹配选项
    const matchedOption =
      nextUserMessage && msg.sugestions?.includes(nextUserMessage) ? nextUserMessage : undefined;

    // 更新消息
    messages[i] = {
      ...msg,
      disabled: !isLastMessage,
      selectedOption: matchedOption,
    };
  }
};

/**
 * 判断是否是 FrontendCommonMessageType
 */
const isFrontendCommonMessage = (
  value: DisplayMessageType | undefined,
): value is FrontendCommonMessageType => {
  return value?.type === "message";
};
