import type {
  SERVER_SEND_MESSAGE_NAME,
  ServerSendMessageData,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import type { StateCreator } from "zustand";
import { combineMessages } from "@/messages/messageCombiner";
import { toast } from "@/utils/toast";
import { getMessageHandler } from "../messageHandlers";
import type { WebSocketStore } from "../websocket";

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
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error("WebSocket 未连接");
      return;
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

    let taskId = messageData.taskId || state.mainTaskId;
    if (message.type === "assignTaskUpdated" && messageData.parentTaskId) {
      taskId = messageData.parentTaskId;
    }

    const handler = getMessageHandler(message.type as SERVER_SEND_MESSAGE_NAME);
    const handled = handler(message, get());

    if (handled) {
      return;
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
    console.log("his", newDisplayMessages);

    set({
      tasks: {
        ...get().tasks,
        [taskId]: {
          ...latestTask,
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
