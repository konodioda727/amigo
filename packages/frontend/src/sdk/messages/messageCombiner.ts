import type {
  CompleteTaskWebsocketData,
  SERVER_SEND_MESSAGE_NAME,
  ToolParams,
  ToolResult,
  TransportToolContent,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
  WorkflowPhase,
} from "@amigo-llm/types";
import type {
  DisplayMessageType,
  FrontendCommonMessageType,
  FrontendToolMessageType,
  ReadSummaryDisplayType,
} from "./types";
import { DisplayMessageTypeNames } from "./types";

type SupportedWebsocketMessage = WebSocketMessage<
  SERVER_SEND_MESSAGE_NAME | USER_SEND_MESSAGE_NAME
>;

const getStableUpdateTime = (candidate: unknown, res: DisplayMessageType[]): number => {
  const lastUpdateTime = res.at(-1)?.updateTime;
  const hasLast = typeof lastUpdateTime === "number" && Number.isFinite(lastUpdateTime);

  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    if (!hasLast) {
      return candidate;
    }
    return candidate >= (lastUpdateTime as number) ? candidate : (lastUpdateTime as number) + 1;
  }

  if (hasLast) {
    return (lastUpdateTime as number) + 1;
  }

  return 0;
};

type MessageProcessor<T extends SERVER_SEND_MESSAGE_NAME | USER_SEND_MESSAGE_NAME> = (params: {
  msg: WebSocketMessage<T>;
  res: DisplayMessageType[];
}) => { handled: boolean };

const thinkProcessor: MessageProcessor<"think"> = ({ msg: thinkMsg }) => {
  if (thinkMsg.type !== "think") return { handled: false };
  // Keep think events in raw history, but do not surface them in the UI timeline.
  return { handled: true };
};

const messageProcessor: MessageProcessor<"message"> = ({ msg, res }) => {
  if (msg.type !== "message") return { handled: false };
  const messageData = msg.data as WebSocketMessage<"message">["data"];
  const updateTime = getStableUpdateTime(messageData.updateTime, res);
  const isPartial = messageData.partial ?? false;

  const messageEntry: FrontendCommonMessageType = {
    message: messageData.message ?? "",
    updateTime,
    type: "message",
    partial: isPartial,
  } as any;

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
    } as any;
  } else {
    res.push(messageEntry);
  }
  return { handled: true };
};

const toolProcessor: MessageProcessor<"tool"> = ({ msg, res }) => {
  if (msg.type !== "tool") return { handled: false };
  // 解析 tool 消息，结构化为 DisplayMessageType
  const parsed = JSON.parse(msg.data.message) as TransportToolContent<any> & {
    toolCallId?: string;
    error?: string;
    websocketData?: unknown;
  };
  const { toolName, params, result, error, toolCallId, websocketData } = parsed;
  const sourceUpdateTime =
    typeof msg.data.updateTime === "number" && Number.isFinite(msg.data.updateTime)
      ? msg.data.updateTime
      : undefined;
  const updateTime = getStableUpdateTime(msg.data.updateTime, res);
  const isPartial = msg.data.partial ?? false;
  const workflowPhase = extractWorkflowPhaseFromToolPayload(toolName, websocketData);

  const existingIndex = findMatchingToolMessageIndex(
    res,
    toolName,
    toolCallId,
    sourceUpdateTime ?? updateTime,
  );
  const existingMessage = existingIndex >= 0 ? res[existingIndex] : undefined;
  const shouldMerge = existingMessage?.type === "tool";

  if (shouldMerge && existingMessage?.type === "tool") {
    // 合并同一次工具调用的 partial/final 消息，即便中间夹了其它消息。
    res[existingIndex] = {
      type: "tool",
      toolName: existingMessage.toolName,
      params: (params as unknown as ToolParams<any>) || existingMessage.params,
      toolOutput: result as unknown as ToolResult<any>,
      websocketData: websocketData ?? existingMessage.websocketData,
      workflowPhase: workflowPhase ?? existingMessage.workflowPhase,
      toolCallId: toolCallId || existingMessage.toolCallId,
      sourceUpdateTime: existingMessage.sourceUpdateTime ?? sourceUpdateTime ?? updateTime,
      error,
      hasError: !!error,
      updateTime: existingMessage.updateTime,
      partial: isPartial,
    } as any;
  } else {
    // 创建新的 tool 条目
    res.push({
      type: "tool",
      toolName,
      params: params as unknown as ToolParams<any>,
      toolOutput: result as unknown as ToolResult<any>,
      websocketData,
      workflowPhase,
      toolCallId,
      sourceUpdateTime: sourceUpdateTime ?? updateTime,
      error,
      hasError: !!error,
      updateTime,
      partial: isPartial,
    } as any);
  }

  return { handled: true };
};

const extractWorkflowPhaseFromToolPayload = (
  toolName: string,
  websocketData: unknown,
): WorkflowPhase | undefined => {
  if (toolName !== "completeTask" || !websocketData || typeof websocketData !== "object") {
    return undefined;
  }

  const data = websocketData as Partial<CompleteTaskWebsocketData>;
  return data.completedPhase || data.currentPhase;
};

const defaultProcessor: MessageProcessor<any> = ({ msg, res }) => {
  if (!DisplayMessageTypeNames.includes(msg.type)) return { handled: false };
  res.push(msg as unknown as DisplayMessageType);
  return { handled: true };
};

const userSendMessageProcessor: MessageProcessor<"userSendMessage"> = ({ msg, res }) => {
  if (msg.type !== "userSendMessage") return { handled: false };
  const userMsg = msg.data as {
    message: string;
    attachments?: any[];
    updateTime?: number;
    status?: "pending" | "acked" | "failed";
  };
  res.push({
    type: "userSendMessage",
    message: userMsg.message ?? "",
    attachments: userMsg.attachments,
    updateTime: getStableUpdateTime(userMsg.updateTime, res),
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

  const updateTime = getStableUpdateTime(msg.data.updateTime, res);
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
    updateTime: getStableUpdateTime(msg.data.updateTime, res),
  });
  return { handled: true };
};

const errorProcessor: MessageProcessor<"error"> = ({ msg, res }) => {
  if (msg.type !== "error") return { handled: false };

  res.push({
    type: "error",
    message: msg.data.message || "未知错误",
    updateTime: getStableUpdateTime(msg.data.updateTime, res),
  });
  return { handled: true };
};

const waitingToolCallProcessor: MessageProcessor<"waiting_tool_call"> = ({ msg }) => {
  if (msg.type !== "waiting_tool_call") return { handled: false };
  return { handled: true };
};

const processorMap: Partial<
  Record<SERVER_SEND_MESSAGE_NAME | USER_SEND_MESSAGE_NAME, MessageProcessor<any>>
> = {
  think: thinkProcessor,
  message: messageProcessor,
  userSendMessage: userSendMessageProcessor,
  tool: toolProcessor,
  askFollowupQuestion: askFollowupQuestionProcessor,
  interrupt: interruptProcessor,
  error: errorProcessor,
  waiting_tool_call: waitingToolCallProcessor,
};

export const combineMessages = (messages: SupportedWebsocketMessage[]): DisplayMessageType[] => {
  const res: DisplayMessageType[] = [];

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
    processor({ msg, res });
  }

  // 后处理：为 askFollowupQuestion 设置 disabled 和 selectedOption
  postProcessAskFollowupQuestions(res);

  return aggregateReadToolMessages(res);
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

const READ_TOOL_NAMES = new Set([
  "browserSearch",
  "listDesignDocs",
  "listDesignDrafts",
  "readDesignBrief",
  "readDesignDoc",
  "readDesignDraft",
  "readFile",
  "readRules",
  "readSkillBundle",
]);

const isReadToolMessage = (
  message: DisplayMessageType | undefined,
): message is FrontendToolMessageType<any> => {
  return (
    message?.type === "tool" &&
    READ_TOOL_NAMES.has(String(message.toolName)) &&
    !message.hasError &&
    message.partial !== true
  );
};

const aggregateReadToolMessages = (messages: DisplayMessageType[]): DisplayMessageType[] => {
  const aggregated: DisplayMessageType[] = [];
  let bucket: FrontendToolMessageType<any>[] = [];

  const flushBucket = () => {
    if (bucket.length === 0) return;
    aggregated.push(buildReadSummary(bucket));
    bucket = [];
  };

  for (const message of messages) {
    if (isReadToolMessage(message)) {
      bucket.push(message);
      continue;
    }

    flushBucket();
    aggregated.push(message);
  }

  flushBucket();
  return aggregated;
};

const buildReadSummary = (messages: FrontendToolMessageType<any>[]): ReadSummaryDisplayType => {
  const filePaths = new Set<string>();
  const searchQueries = new Set<string>();
  const resourceLabels = new Set<string>();
  let searchCount = 0;
  let resourceCount = 0;

  for (const message of messages) {
    const params = message.params as any;
    const toolOutput = message.toolOutput as any;

    switch (String(message.toolName)) {
      case "readFile": {
        const paramsFilePaths = Array.isArray(params?.filePaths) ? params.filePaths : [];
        const outputFilePaths = Array.isArray(toolOutput?.filePaths) ? toolOutput.filePaths : [];
        const outputFiles = Array.isArray(toolOutput?.files) ? toolOutput.files : [];

        for (const filePath of [...paramsFilePaths, ...outputFilePaths]) {
          if (typeof filePath === "string" && filePath) {
            filePaths.add(filePath);
          }
        }

        for (const file of outputFiles) {
          if (typeof file?.filePath === "string" && file.filePath) {
            filePaths.add(file.filePath);
          }
        }
        break;
      }
      case "browserSearch":
        searchCount += 1;
        if (typeof params?.query === "string" && params.query.trim()) {
          searchQueries.add(params.query.trim());
        }
        break;
      case "readRules": {
        const ids = Array.isArray(params?.ids) ? params.ids : [];
        const documents = Array.isArray(toolOutput?.documents) ? toolOutput.documents : [];
        for (const id of ids) {
          if (typeof id === "string" && id.trim()) {
            resourceLabels.add(`规则: ${id.trim()}`);
          }
        }
        for (const document of documents) {
          if (typeof document?.title === "string" && document.title) {
            resourceLabels.add(`规则: ${document.title}`);
          } else if (typeof document?.id === "string" && document.id) {
            resourceLabels.add(`规则: ${document.id}`);
          }
        }
        resourceCount += Math.max(documents.length || ids.length, 1);
        break;
      }
      case "listDesignDocs":
        if (Array.isArray(toolOutput?.availableDocs)) {
          for (const doc of toolOutput.availableDocs) {
            const label = doc?.title || doc?.pageId;
            if (typeof label === "string" && label) {
              resourceLabels.add(`设计稿: ${label}`);
            }
          }
        }
        resourceCount += Array.isArray(toolOutput?.availableDocs)
          ? Math.max(toolOutput.availableDocs.length, 1)
          : 1;
        break;
      case "listDesignDrafts":
        if (Array.isArray(toolOutput?.drafts)) {
          for (const draft of toolOutput.drafts) {
            const label = draft?.title || draft?.draftId;
            if (typeof label === "string" && label) {
              resourceLabels.add(`设计草稿: ${label}`);
            }
          }
        }
        resourceCount += Array.isArray(toolOutput?.drafts)
          ? Math.max(toolOutput.drafts.length, 1)
          : 1;
        break;
      case "readDesignBrief":
        resourceLabels.add("设计 brief");
        resourceCount += 1;
        break;
      case "readDesignDoc": {
        const label = toolOutput?.summary?.title || params?.pageId;
        if (typeof label === "string" && label) {
          resourceLabels.add(`设计稿: ${label}`);
        }
        resourceCount += 1;
        break;
      }
      case "readDesignDraft": {
        const label = toolOutput?.draft?.title || params?.draftId;
        if (typeof label === "string" && label) {
          resourceLabels.add(`设计草稿: ${label}`);
        }
        resourceCount += 1;
        break;
      }
      case "readSkillBundle": {
        const label =
          toolOutput?.skillName || toolOutput?.skillId || params?.skillId || toolOutput?.filePath;
        if (typeof label === "string" && label) {
          resourceLabels.add(`技能: ${label}`);
        }
        resourceCount += 1;
        break;
      }
      case "readRepoKnowledge": {
        const label =
          toolOutput?.filePath ||
          params?.filePath ||
          params?.sectionId ||
          toolOutput?.resolvedBranch;
        if (typeof label === "string" && label) {
          resourceLabels.add(`仓库知识: ${label}`);
        }
        resourceCount += 1;
        break;
      }
      default:
        resourceCount += 1;
        break;
    }
  }

  const summaryParts: string[] = [];
  if (filePaths.size > 0) summaryParts.push(`已浏览 ${filePaths.size} 个文件`);
  if (searchCount > 0) summaryParts.push(`${searchCount} 个搜索`);
  if (resourceCount > 0) {
    summaryParts.push(
      summaryParts.length === 0 ? `已浏览 ${resourceCount} 项资料` : `${resourceCount} 项资料`,
    );
  }

  return {
    type: "readSummary",
    text: summaryParts.join("，") || `已浏览 ${messages.length} 个读取操作`,
    fileCount: filePaths.size,
    searchCount,
    resourceCount,
    toolCount: messages.length,
    files: [...filePaths],
    searches: [...searchQueries],
    resources: [...resourceLabels],
    updateTime: messages[messages.length - 1]?.updateTime ?? 0,
  };
};

const findMatchingToolMessageIndex = (
  messages: DisplayMessageType[],
  toolName: string,
  toolCallId: string | undefined,
  sourceUpdateTime: number,
): number => {
  if (toolCallId) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      // Some providers/history re-use toolCallId values like "readFile:0" across
      // distinct calls, so the original websocket updateTime identifies one invocation.
      if (
        message.type === "tool" &&
        message.toolCallId === toolCallId &&
        (message.sourceUpdateTime ?? message.updateTime) === sourceUpdateTime
      ) {
        return i;
      }
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      message.type === "tool" &&
      message.toolName === toolName &&
      (message.sourceUpdateTime ?? message.updateTime) === sourceUpdateTime &&
      message.partial === true
    ) {
      return i;
    }
  }

  return -1;
};
