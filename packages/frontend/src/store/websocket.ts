import { create } from "zustand";
import type {
  WebSocketMessage,
  SERVER_SEND_MESSAGE_NAME,
  ServerSendMessageData,
  USER_SEND_MESSAGE_NAME,
} from "@amigo/types";
import type { DisplayMessageType } from "@/messages/types";
import { combineMessages } from "@/messages/messageCombiner";
import { toast } from "@/utils/toast";
import { getMessageHandler } from "./messageHandlers";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

type Listener<T extends SERVER_SEND_MESSAGE_NAME> = (data: ServerSendMessageData<T>) => void;
type Unsubscribe = () => void;

interface TaskState {
  rawMessages: Array<WebSocketMessage<SERVER_SEND_MESSAGE_NAME> | WebSocketMessage<USER_SEND_MESSAGE_NAME>>;
  displayMessages: DisplayMessageType[];
  isLoading: boolean;
  lastUpdateTime: number;
}

export interface WebSocketStore {
  // WebSocket 连接
  socket: WebSocket | null;
  connectionStatus: ConnectionStatus;

  // 所有 task 的状态
  tasks: Record<string, TaskState>;

  // 当前活动的 task（用于输入框）
  activeTaskId: string | null;

  // 主会话的 taskId
  mainTaskId: string;

  // 会话历史列表
  taskHistories: Array<{ taskId: string; title: string; updatedAt: string }>;

  // 消息订阅器
  listeners: Record<string, Set<Listener<any>>>;

  // 待 mention 的任务（用于自动 mention）
  pendingMention: { taskId: string; title: string } | null;

  // 待处理的 askFollowupQuestion 队列
  followupQueue: Array<{ taskId: string; title: string }>;

  // Actions
  connect: () => void;
  disconnect: () => void;
  registerTask: (taskId: string) => void;
  unregisterTask: (taskId: string) => void;
  sendMessage: <T extends USER_SEND_MESSAGE_NAME>(
    taskId: string,
    message: WebSocketMessage<T>
  ) => void;
  setActiveTask: (taskId: string | null) => void;
  subscribe: <T extends SERVER_SEND_MESSAGE_NAME>(
    type: T,
    listener: Listener<T>
  ) => Unsubscribe;
  processMessage: (message: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>) => void;
  setLoading: (taskId: string, isLoading: boolean) => void;
  clearMessages: (taskId: string) => void;
  setMainTaskId: (taskId: string) => void;
  createNewConversation: () => void;
  updateUserMessageStatus: (
    taskId: string,
    message: string,
    status: 'pending' | 'acked' | 'failed'
  ) => void;
  requestMention: (taskId: string, title: string) => void;
  clearPendingMention: () => void;
  updateFollowupQueue: () => void;
  mentionNextInQueue: () => void;
  
  // 内部辅助方法
  handleSessionHistories: (histories: Array<{ taskId: string; title: string; updatedAt: string }>) => void;
  handleTaskHistory: (taskId: string, messages: Array<WebSocketMessage<SERVER_SEND_MESSAGE_NAME>>) => void;
  addMessageToTask: (taskId: string, message: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>) => void;
  notifyListeners: (message: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>) => void;
}

export const useWebSocketStore = create<WebSocketStore>((set, get) => ({
  socket: null,
  connectionStatus: "disconnected",
  tasks: {},
  activeTaskId: null,
  mainTaskId: "",
  taskHistories: [],
  listeners: {},
  pendingMention: null,
  followupQueue: [],

  connect: () => {
    const { socket } = get();
    if (socket?.readyState === WebSocket.OPEN) return;

    set({ connectionStatus: "connecting" });
    const ws = new WebSocket("ws://localhost:10013");

    ws.onopen = () => {
      set({ socket: ws, connectionStatus: "connected" });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage<SERVER_SEND_MESSAGE_NAME>;
        get().processMessage(message);
      } catch (error) {
        console.error("[WebSocketStore] Failed to parse message:", error);
      }
    };

    ws.onclose = () => {
      set({ socket: null, connectionStatus: "disconnected" });
      // TODO: 实现自动重连
    };

    ws.onerror = (error) => {
      console.error("[WebSocketStore] WebSocket error:", error);
    };
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null, connectionStatus: "disconnected" });
    }
  },

  registerTask: (taskId: string) => {
    const { tasks } = get();
    if (!tasks[taskId]) {
      set({
        tasks: {
          ...tasks,
          [taskId]: {
            rawMessages: [],
            displayMessages: [],
            isLoading: false,
            lastUpdateTime: Date.now(),
          },
        },
      });
    }
  },

  unregisterTask: (taskId: string) => {
    const { tasks } = get();
    const newTasks = { ...tasks };
    delete newTasks[taskId];
    set({ tasks: newTasks });
  },

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

    // 如果是 userSendMessage，立即添加到 displayMessages（状态为 pending）
    if (message.type === 'userSendMessage') {
      const task = tasks[taskId];
      if (task) {
        const pendingMessage: WebSocketMessage<'userSendMessage'> = {
          type: 'userSendMessage',
          data: {
            message: (message.data as any).message,
            taskId,
            updateTime: Date.now(),
            status: 'pending',
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

  setActiveTask: (taskId) => {
    set({ activeTaskId: taskId });
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
    
    // 特殊处理：assignTaskUpdated 应该使用 parentTaskId
    let taskId = messageData.taskId || state.mainTaskId;
    if (message.type === 'assignTaskUpdated' && messageData.parentTaskId) {
      taskId = messageData.parentTaskId;
    }

    // 获取对应的消息处理器
    const handler = getMessageHandler(message.type as SERVER_SEND_MESSAGE_NAME);
    const handled = handler(message, get());

    // 如果处理器返回 true，表示已完全处理，不需要继续
    if (handled) {
      return;
    }

    // 添加消息到 task
    get().addMessageToTask(taskId, message);

    // 通知订阅者
    get().notifyListeners(message);
  },

  setLoading: (taskId, isLoading) => {
    const { tasks } = get();
    const task = tasks[taskId];
    if (!task) return;

    set({
      tasks: {
        ...tasks,
        [taskId]: {
          ...task,
          isLoading,
        },
      },
    });
  },

  clearMessages: (taskId) => {
    const { tasks } = get();
    const task = tasks[taskId];
    if (!task) return;

    set({
      tasks: {
        ...tasks,
        [taskId]: {
          ...task,
          rawMessages: [],
          displayMessages: [],
        },
      },
    });
  },

  setMainTaskId: (taskId) => {
    const { socket, mainTaskId: currentTaskId } = get();
    
    // 如果 taskId 没有变化，不做任何操作
    if (taskId === currentTaskId) return;
    
    set({ mainTaskId: taskId });
    
    // 注册新的 task
    get().registerTask(taskId);
    
    // 发送 loadTask 消息加载历史
    if (socket && socket.readyState === WebSocket.OPEN && taskId) {
      socket.send(
        JSON.stringify({
          type: "loadTask",
          data: { taskId },
        })
      );
    }
  },

  createNewConversation: () => {
    const { mainTaskId } = get();
    get().clearMessages(mainTaskId);
    set({ mainTaskId: "", activeTaskId: null });
  },

  requestMention: (taskId, title) => {
    set({ pendingMention: { taskId, title } });
  },

  clearPendingMention: () => {
    set({ pendingMention: null });
  },

  updateFollowupQueue: () => {
    const state = get();
    const mainTaskId = state.mainTaskId;
    const mainTaskState = state.tasks[mainTaskId];
    
    if (!mainTaskState) {
      set({ followupQueue: [] });
      return;
    }

    const displayMessages = mainTaskState.displayMessages || [];
    const queue: Array<{ taskId: string; title: string }> = [];

    // 遍历所有消息，查找所有的 assignTasks
    for (const msg of displayMessages) {
      if (msg.type === "tool") {
        const toolMsg = msg as {
          type: "tool";
          toolName: string;
          params: Record<string, unknown>;
        };
        
        if (toolMsg.toolName === "assignTasks") {
          const params = toolMsg.params as { 
            tasklist?: Array<{ taskId?: string; target?: string; completed?: boolean }> 
          };
          const tasklist = params.tasklist || [];

          tasklist.forEach((task, idx: number) => {
            if (task.taskId && !task.completed) {
              // 检查子任务的状态
              const subTaskState = state.tasks[task.taskId];
              const subTaskMessages = subTaskState?.displayMessages || [];
              const lastSubTaskMessage = subTaskMessages[subTaskMessages.length - 1];
              
              // 如果子任务有 askFollowupQuestion，添加到队列
              if (lastSubTaskMessage?.type === "askFollowupQuestion") {
                queue.push({
                  taskId: task.taskId,
                  title: task.target || `子任务 #${idx + 1}`,
                });
              }
            }
          });
        }
      }
    }

    set({ followupQueue: queue });
  },

  mentionNextInQueue: () => {
    const state = get();
    const queue = state.followupQueue;
    
    if (queue.length > 0) {
      const next = queue[0];
      state.requestMention(next.taskId, next.title);
    } else {
      // 队列为空，清除 mention
      state.clearPendingMention();
    }
  },

  updateUserMessageStatus: (taskId, message, status) => {
    const { tasks } = get();
    const task = tasks[taskId];
    if (!task) return;

    const updatedRawMessages = task.rawMessages.map((msg) => {
      if (
        msg.type === 'userSendMessage' &&
        (msg.data as any).status === 'pending' &&
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

  // ========== 内部辅助方法 ==========

  handleSessionHistories: (histories) => {
    set({ taskHistories: histories });
  },

  handleTaskHistory: (taskId, messages) => {
    const task = get().tasks[taskId];
    
    // 如果 task 不存在，先注册
    if (!task) {
      get().registerTask(taskId);
    }

    // taskHistory 包含完整的历史记录，应该替换而不是追加
    const newDisplayMessages = combineMessages(messages as any);
    const latestTask = get().tasks[taskId];
    console.log('his', newDisplayMessages);
    
    
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

    // 更新 followup 队列
    get().updateFollowupQueue();
    
    // 如果队列有变化且当前没有 pending mention，自动 mention 下一个
    const currentQueue = get().followupQueue;
    const currentPending = get().pendingMention;
    if (currentQueue.length > 0 && !currentPending) {
      get().mentionNextInQueue();
    }
  },

  addMessageToTask: (taskId, message) => {
    const state = get();
    let task = state.tasks[taskId];

    // 如果 task 不存在，先注册
    if (!task) {
      get().registerTask(taskId);
      task = get().tasks[taskId];
      if (!task) return;
    }

    const newRawMessages = [...task.rawMessages, message];
    const newDisplayMessages = combineMessages(newRawMessages as any);
    
    // 获取最新的 task 状态（可能在其他方法中已更新）
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

    // 更新 followup 队列
    get().updateFollowupQueue();
    
    // 如果队列有变化且当前没有 pending mention，自动 mention 下一个
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
}));
