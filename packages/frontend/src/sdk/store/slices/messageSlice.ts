import type {
  SERVER_SEND_MESSAGE_NAME,
  ServerSendMessageData,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import type { StateCreator } from "zustand";
import { toast } from "@/utils/toast";
import { combineMessages } from "../../messages/messageCombiner";
import { getMessageHandler } from "../messageHandlers";
import type { WebSocketStore } from "../websocket";
import type { DocType } from "./docSlice";

const checkAndExtractDoc = (
  message: WebSocketMessage<any>,
  store: WebSocketStore,
  taskId: string,
) => {
  if (taskId !== store.mainTaskId) return;

  if (message.type === "tool") {
    try {
      const parsed = JSON.parse((message.data as any).message || "{}");
      if (parsed.toolName === "createTaskDocs") {
        const params = parsed.params;
        if (params && params.content) {
          // Use phase from params if available, otherwise try to infer or default
          const phase = params.phase as DocType | undefined;
          store.setDocContent(params.content, params.taskName || params.title, phase);
        }
      }
    } catch (e) {
      // ignore parse error
      console.error("Error parsing tool message for createTaskDocs", e);
    }
  }
};

interface DocInfo {
  content: string;
  title: string;
}

type DocCollection = Partial<Record<DocType, DocInfo>>;

interface DocsResult {
  docs: DocCollection;
  lastEdited: DocType | null;
}

const extractPendingToolCallFromMessages = (
  messages: Array<WebSocketMessage<SERVER_SEND_MESSAGE_NAME>>,
  expectedToolName?: string,
) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== "tool") continue;

    try {
      const msgData = msg.data as { message: string };
      const toolData = JSON.parse(msgData.message) as { toolName?: string; params?: any };
      if (!toolData.toolName) continue;
      if (expectedToolName && toolData.toolName !== expectedToolName) continue;

      return {
        toolName: toolData.toolName,
        params: toolData.params,
      };
    } catch {
      // ignore parse error and continue searching older tool messages
    }
  }

  return null;
};

const inferTaskStatusFromHistory = (
  messages: Array<WebSocketMessage<SERVER_SEND_MESSAGE_NAME>>,
): "idle" | "interrupted" | "completed" | "error" | "waiting_tool_call" => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;

    if (msg.type === "waiting_tool_call") {
      return "waiting_tool_call";
    }

    if (msg.type === "interrupt") {
      return "interrupted";
    }

    if (msg.type === "error") {
      return "error";
    }

    if (msg.type === "conversationOver") {
      const reason = (msg.data as { reason?: string }).reason;
      if (reason === "interrupt") return "interrupted";
      if (reason === "error") return "error";
      if (reason === "completeTask") return "completed";
      return "idle";
    }

    if (msg.type === "alert") {
      const severity = (msg.data as { severity?: string }).severity;
      if (severity === "error") return "error";
    }
  }

  return "idle";
};

const findLatestDocs = (messages: WebSocketMessage<any>[]): DocsResult => {
  const docs: DocCollection = {};
  let lastEdited: DocType | null = null;

  for (const msg of messages) {
    if (msg.type === "taskHistory") {
      const historyData = msg.data as { messages: WebSocketMessage<any>[]; taskId: string };
      if (historyData.messages && Array.isArray(historyData.messages)) {
        const nestedDocs = findLatestDocs(historyData.messages);
        Object.assign(docs, nestedDocs.docs);
        if (nestedDocs.lastEdited) {
          lastEdited = nestedDocs.lastEdited;
        }
      }
    } else if (msg.type === "tool") {
      try {
        const parsed = JSON.parse((msg.data as any).message || "{}");
        if (parsed.toolName === "createTaskDocs") {
          const params = parsed.params;
          if (params && params.content) {
            const phase = (params.phase as DocType) || "taskList";
            if (["requirements", "design", "taskList"].includes(phase)) {
              docs[phase] = {
                content: params.content,
                title: params.taskName || params.title,
              };
              lastEdited = phase;
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }
  }
  return { docs, lastEdited };
};

type Listener<T extends SERVER_SEND_MESSAGE_NAME> = (data: ServerSendMessageData<T>) => void;
type Unsubscribe = () => void;

export interface MessageSlice {
  listeners: Record<string, Set<Listener<any>>>;

  sendMessage: <T extends USER_SEND_MESSAGE_NAME>(
    taskId: string,
    message: WebSocketMessage<T>,
  ) => void;
  subscribe: <T extends SERVER_SEND_MESSAGE_NAME>(type: T, listener: Listener<T>) => Unsubscribe;
  processMessage: (message: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>) => void;
  updateUserMessageStatus: (
    taskId: string,
    message: string,
    status: "pending" | "acked" | "failed",
  ) => void;
  handleTaskHistory: (
    taskId: string,
    messages: Array<WebSocketMessage<SERVER_SEND_MESSAGE_NAME>>,
  ) => void;
  addMessageToTask: (taskId: string, message: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>) => void;
  notifyListeners: (message: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>) => void;
}

export const createMessageSlice: StateCreator<WebSocketStore, [], [], MessageSlice> = (
  set,
  get,
) => ({
  listeners: {},

  sendMessage: (taskId, message) => {
    const { socket, tasks } = get();
    const isFirstConversationMessage =
      (!taskId || taskId.trim() === "") &&
      (message.type === "userSendMessage" || message.type === "createTask");

    // Debug logging
    console.log("[MessageSlice] sendMessage called:", {
      hasSocket: !!socket,
      readyState: socket?.readyState,
      readyStateString: socket
        ? ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][socket.readyState]
        : "NO_SOCKET",
      taskId,
      messageType: message.type,
    });

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      const stateStr = socket
        ? ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][socket.readyState]
        : "NO_SOCKET";
      toast.error(`WebSocket 未连接 (状态: ${stateStr})`);
      return;
    }

    if (isFirstConversationMessage) {
      get().setCreatingConversation(true);
    }

    const messageToSend = {
      ...message,
      data: {
        ...message.data,
        taskId,
      },
    };

    if (message.type === "userSendMessage") {
      const task = tasks[taskId];
      if (task) {
        const pendingMessage: WebSocketMessage<"userSendMessage"> = {
          type: "userSendMessage",
          data: {
            message: (message.data as any).message,
            attachments: (message.data as any).attachments,
            taskId,
            updateTime: Date.now(),
            status: "pending",
          },
        };

        const newRawMessages = [...task.rawMessages, pendingMessage as any];
        const newDisplayMessages = combineMessages(newRawMessages as any);

        set({
          tasks: {
            ...get().tasks,
            [taskId]: {
              ...task,
              rawMessages: newRawMessages,
              displayMessages: newDisplayMessages,
              lastUpdateTime: Date.now(),
            },
          },
        });
      }
    }

    socket.send(JSON.stringify(messageToSend));
  },

  subscribe: (type, listener) => {
    const { listeners } = get();
    const typeListeners = listeners[type] || new Set();
    typeListeners.add(listener);

    set({
      listeners: {
        ...listeners,
        [type]: typeListeners,
      },
    });

    return () => {
      const { listeners } = get();
      const typeListeners = listeners[type];
      if (typeListeners) {
        typeListeners.delete(listener);
      }
    };
  },

  processMessage: (message) => {
    const state = get();
    const messageData = message.data as any;

    const taskId = messageData.taskId || state.mainTaskId;

    const handler = getMessageHandler(message.type as SERVER_SEND_MESSAGE_NAME);
    const handled = handler(message, get());

    if (handled) {
      return;
    }

    if (
      message.type === "message" &&
      messageData.role === "system" &&
      messageData.content &&
      messageData.content.includes("Waiting for confirmation")
    ) {
      const task = get().tasks[taskId];
      if (task && task.status !== "waiting_tool_call") {
        get().setTaskStatus(taskId, "waiting_tool_call");
      }
    }

    get().addMessageToTask(taskId, message);
    get().notifyListeners(message);
  },

  updateUserMessageStatus: (taskId, message, status) => {
    const { tasks } = get();
    const task = tasks[taskId];
    if (!task) return;

    const updatedRawMessages = task.rawMessages.map((msg) => {
      if (
        msg.type === "userSendMessage" &&
        (msg.data as any).status === "pending" &&
        (msg.data as any).message === message
      ) {
        return {
          ...msg,
          data: {
            ...msg.data,
            status,
          },
        };
      }
      return msg;
    });

    const newDisplayMessages = combineMessages(updatedRawMessages as any);
    set({
      tasks: {
        ...get().tasks,
        [taskId]: {
          ...task,
          rawMessages: updatedRawMessages,
          displayMessages: newDisplayMessages,
          lastUpdateTime: Date.now(),
        },
      },
    });
  },

  handleTaskHistory: (taskId, messages) => {
    const task = get().tasks[taskId];

    if (!task) {
      get().registerTask(taskId);
    }

    const newDisplayMessages = combineMessages(messages as any);
    const latestTask = get().tasks[taskId];

    if (taskId === get().mainTaskId) {
      // Reset doc state and close sidebar when switching tasks
      get().setDocState({
        isOpen: false,
        documents: {
          requirements: { content: null, title: "Requirements" },
          design: { content: null, title: "Design" },
          taskList: { content: null, title: "Task List" },
        },
      });

      const foundDocs = findLatestDocs(messages);

      (Object.keys(foundDocs.docs) as DocType[]).forEach((phase) => {
        const doc = foundDocs.docs[phase];
        if (doc) {
          get().setDocContent(doc.content, doc.title, phase);
        }
      });

      if (foundDocs.lastEdited) {
        get().setActiveDoc(foundDocs.lastEdited);
      }
    }

    // Check if the last message is waiting_tool_call
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.type === "waiting_tool_call") {
      console.log("[handleTaskHistory] Found waiting_tool_call in history");
      get().setTaskStatus(taskId, "waiting_tool_call");

      const waitingToolCallData = lastMessage.data as {
        toolName?: string;
        params?: any;
      };

      let pendingToolName = waitingToolCallData.toolName;
      let pendingParams = waitingToolCallData.params;

      if (!pendingToolName || pendingParams === undefined) {
        const fallback = extractPendingToolCallFromMessages(messages, pendingToolName);
        if (fallback) {
          pendingToolName = pendingToolName || fallback.toolName;
          if (pendingParams === undefined) {
            pendingParams = fallback.params;
          }
        }
      }

      if (pendingToolName) {
        get().setPendingToolCall(taskId, {
          toolName: pendingToolName,
          params: pendingParams,
        });
        console.log("[handleTaskHistory] Set pending tool call from history:", {
          toolName: pendingToolName,
          hasParams: pendingParams !== undefined,
        });
      } else {
        get().setPendingToolCall(taskId, undefined);
      }
    } else if (
      lastMessage &&
      lastMessage.type === "message" &&
      (lastMessage.data as any).role === "system" &&
      (lastMessage.data as any).content &&
      (lastMessage.data as any).content.includes("Waiting for confirmation")
    ) {
      if (get().tasks[taskId].status !== "waiting_tool_call") {
        get().setTaskStatus(taskId, "waiting_tool_call");
      }
      get().setPendingToolCall(taskId, undefined);
    } else {
      get().setTaskStatus(taskId, inferTaskStatusFromHistory(messages));
      get().setPendingToolCall(taskId, undefined);
    }

    // Get the latest task state after status updates
    const updatedTask = get().tasks[taskId];

    set({
      tasks: {
        ...get().tasks,
        [taskId]: {
          ...updatedTask,
          rawMessages: messages,
          displayMessages: newDisplayMessages,
          lastUpdateTime: Date.now(),
        },
      },
    });

    get().updateFollowupQueue();

    const currentQueue = get().followupQueue;
    const currentPending = get().pendingMention;
    if (currentQueue.length > 0 && !currentPending) {
      get().mentionNextInQueue();
    }
  },

  addMessageToTask: (taskId, message) => {
    const state = get();
    let task = state.tasks[taskId];

    if (!task) {
      get().registerTask(taskId);
      task = get().tasks[taskId];
      if (!task) return;
    }

    const newRawMessages = [...task.rawMessages, message];
    const newDisplayMessages = combineMessages(newRawMessages as any);

    const latestTask = get().tasks[taskId];

    // Check for createDoc
    checkAndExtractDoc(message, get(), taskId);

    set({
      tasks: {
        ...get().tasks,
        [taskId]: {
          ...latestTask,
          rawMessages: newRawMessages,
          displayMessages: newDisplayMessages,
          lastUpdateTime: Date.now(),
        },
      },
    });

    get().updateFollowupQueue();

    const currentQueue = get().followupQueue;
    const currentPending = get().pendingMention;
    if (currentQueue.length > 0 && !currentPending) {
      get().mentionNextInQueue();
    }
  },

  notifyListeners: (message) => {
    const state = get();
    const messageType = message.type as SERVER_SEND_MESSAGE_NAME;
    const listeners = state.listeners[messageType];

    if (listeners) {
      for (const listener of listeners) {
        listener(message.data);
      }
    }
  },
});
