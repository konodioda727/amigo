import type {
  SERVER_SEND_MESSAGE_NAME,
  ToolParams,
  ToolResult,
  TransportToolContent,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo/types";
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

const thinkProcessor: MessageProcessor<'think'> = ({ msg: thinkMsg, res, pendingThink }) => {
  if (thinkMsg.type !== "think") return { handled: false };
  const thinkData = thinkMsg.data;
  const thinkEntry: FrontendCommonMessageType = {
    message: "",
    think: thinkData.message ?? "",
    updateTime: thinkData.updateTime || Date.now(),
    type: 'message'
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

const messageProcessor: MessageProcessor<'message'> = ({ msg, res, pendingThink }) => {
  if (msg.type !== "message") return { handled: false };
  const messageData = msg.data as WebSocketMessage<"message">["data"] & {
    think?: string;
  };
  const messageEntry: FrontendCommonMessageType = {
    message: messageData.message ?? "",
    updateTime: messageData.updateTime || Date.now(),
    type: 'message'
  };
  if (messageData.think) {
    messageEntry.think = messageData.think;
  } else if (pendingThink?.data?.message) {
    messageEntry.think = pendingThink.data.message;
  }
  const lastMessage = res.at(-1);
  if (isFrontendCommonMessage(lastMessage)) {
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

const completionResultProcessor: MessageProcessor<'completionResult'> = ({ msg, res }) => {
  if (msg.type !== "completionResult") return { handled: false };
  const completionData = msg.data;
  let conclusion = '';
  try {
    const parsed = JSON.parse(completionData.message || "");
    conclusion = parsed?.params?.completionResult?.content || parsed?.result?.completionResult || '';
  } catch (error) {
    console.error("处理 completionResult 消息时出错:", error);
  }
  const completionEntry: CompletionResultType = {
    result: conclusion,
    updateTime: completionData.updateTime || Date.now(),
    type: 'completionResult'
  };
  res.push(completionEntry);
  return { handled: true };
}

const toolProcessor: MessageProcessor<'tool'> = ({ msg, res }) => {
  if (msg.type !== "tool") return { handled: false };
  // 解析 tool 消息，结构化为 DisplayMessageType
  const { toolName, params, result } = JSON.parse(msg.data.message) as TransportToolContent<any>;
  const updateTime = typeof msg.data.updateTime === "number" ? msg.data.updateTime : Date.now();
  
  // 查找是否已经有相同 toolName 和 updateTime 的 tool（partial 消息）
  const existingToolIndex = res.findIndex(
    (item) => 
      item.type === "tool" && 
      item.toolName === toolName && 
      item.updateTime === updateTime
  );
  
  if (existingToolIndex !== -1 && res[existingToolIndex].type === "tool") {
    // 更新已存在的 tool，添加 result
    const existingTool = res[existingToolIndex];
    res[existingToolIndex] = {
      type: "tool",
      toolName: existingTool.toolName,
      params: existingTool.params,
      toolOutput: result as unknown as ToolResult<any>,
      updateTime: existingTool.updateTime,
    };
  } else {
    // 创建新的 tool 条目
    res.push({
      type: "tool",
      toolName,
      params: params as unknown as ToolParams<any>,
      toolOutput: result as unknown as ToolResult<any>,
      updateTime,
    });
  }
  
  return { handled: true };
};

const defaultProcessor: MessageProcessor<any> = ({ msg, res, pendingThink }) => {
  if (!DisplayMessageTypeNames.includes(msg.type)) return { handled: false };
  res.push( msg as unknown as DisplayMessageType);
  return { handled: true, pendingThink };
};

const userSendMessageProcessor: MessageProcessor<'userSendMessage'> = ({ msg, res }) => {
  if (msg.type !== "userSendMessage") return { handled: false };
  const userMsg = msg.data as { message: string; updateTime?: number; status?: "pending" | "acked" | "failed" };
  res.push({
    type: "userSendMessage",
    message: userMsg.message ?? "",
    updateTime: typeof userMsg.updateTime === "number" ? userMsg.updateTime : Date.now(),
    status: userMsg.status,
  });
  return { handled: true };
};

const askFollowupQuestionProcessor: MessageProcessor<'askFollowupQuestion'> = ({ msg, res }) => {
  if (msg.type !== "askFollowupQuestion") return { handled: false };
  
  const followupData = JSON.parse(msg.data.message)?.params as {
    question: string;
    suggestOptions: string[];
  };
  
  res.push({
    type: "askFollowupQuestion",
    question: followupData.question ?? "",
    sugestions: followupData.suggestOptions ?? [],
    updateTime: msg.data.updateTime || new Date().valueOf() + Math.random(),
  });
  return { handled: true };
};

const assignTaskUpdatedProcessor: MessageProcessor<'assignTaskUpdated'> = ({ msg, res }) => {
  if (msg.type !== "assignTaskUpdated") return { handled: false };
  
  const updateData = msg.data as { index: number; taskId: string; parentTaskId?: string };
  
  // 从后往前查找最近的 assignTasks tool
  for (let i = res.length - 1; i >= 0; i--) {
    const item = res[i];
    if (item.type === "tool" && item.toolName === "assignTasks") {
      // 找到了 assignTasks，给对应的 task 添加 taskId
      const params = item.params as any;
      if (params?.tasklist && Array.isArray(params.tasklist)) {
        const task = params.tasklist[updateData.index];
        if (task) {
          // 添加 taskId 到对应的 task
          params.tasklist[updateData.index] = {
            ...task,
            taskId: updateData.taskId,
          };
          // 更新 res 中的项
          res[i] = { ...item, params };
        }
      }
      break;
    }
  }
  
  return { handled: true };
};

const interruptProcessor: MessageProcessor<'interrupt'> = ({ msg, res }) => {
  if (msg.type !== "interrupt") return { handled: false };
  
  res.push({
    type: "interrupt",
    updateTime: msg.data.updateTime || Date.now(),
  });
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
  assignTaskUpdated: assignTaskUpdatedProcessor,
  interrupt: interruptProcessor,
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
  return res;
};

/**
 * 判断是否是 FrontendCommonMessageType
 */
const isFrontendCommonMessage = (
  value: DisplayMessageType | undefined,
): value is FrontendCommonMessageType => {
  return value?.type === 'message';
};
