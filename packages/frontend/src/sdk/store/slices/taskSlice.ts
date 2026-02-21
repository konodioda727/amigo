import type { SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import type { StateCreator } from "zustand";
import type { DisplayMessageType } from "../../messages/types";
import type { WebSocketStore } from "../websocket";

export type TaskStatus =
  | "idle"
  | "streaming"
  | "interrupted"
  | "completed"
  | "error"
  | "waiting_tool_call";

export interface TaskState {
  rawMessages: Array<WebSocketMessage<SERVER_SEND_MESSAGE_NAME> | WebSocketMessage<any>>;
  displayMessages: DisplayMessageType[];
  status: TaskStatus;
  lastUpdateTime: number;
  pendingToolCall?: {
    toolName: string;
    params: any;
  };
}

export interface TaskSlice {
  tasks: Record<string, TaskState>;
  activeTaskId: string | null;
  mainTaskId: string;
  taskHistories: Array<{ taskId: string; title: string; updatedAt: string }>;

  registerTask: (taskId: string) => void;
  unregisterTask: (taskId: string) => void;
  setActiveTask: (taskId: string | null) => void;
  setTaskStatus: (taskId: string, status: TaskStatus) => void;
  setPendingToolCall: (
    taskId: string,
    toolCall: { toolName: string; params: any } | undefined,
  ) => void;
  clearMessages: (taskId: string) => void;
  setMainTaskId: (taskId: string) => void;
  createNewConversation: () => void;
  handleSessionHistories: (
    histories: Array<{ taskId: string; title: string; updatedAt: string }>,
  ) => void;
}

export const createTaskSlice: StateCreator<WebSocketStore, [], [], TaskSlice> = (set, get) => ({
  tasks: {},
  activeTaskId: null,
  mainTaskId: "",
  taskHistories: [],

  registerTask: (taskId: string) => {
    const { tasks } = get();
    if (!tasks[taskId]) {
      set({
        tasks: {
          ...tasks,
          [taskId]: {
            rawMessages: [],
            displayMessages: [],
            status: "idle",
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

  setActiveTask: (taskId) => {
    set({ activeTaskId: taskId });
  },

  setTaskStatus: (taskId, status) => {
    const { tasks } = get();
    const task = tasks[taskId];
    if (!task) return;

    set({
      tasks: {
        ...tasks,
        [taskId]: {
          ...task,
          status,
        },
      },
    });
  },

  setPendingToolCall: (taskId, toolCall) => {
    const { tasks } = get();
    const task = tasks[taskId];
    if (!task) return;

    set({
      tasks: {
        ...tasks,
        [taskId]: {
          ...task,
          pendingToolCall: toolCall,
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

    if (taskId === currentTaskId) return;

    set({ mainTaskId: taskId });
    get().registerTask(taskId);

    // Close doc sidebar immediately when switching tasks
    // It will be reopened by handleTaskHistory if the new task has docs
    get().closeDoc();

    if (socket && socket.readyState === WebSocket.OPEN && taskId) {
      socket.send(
        JSON.stringify({
          type: "loadTask",
          data: { taskId },
        }),
      );
    }
  },

  createNewConversation: () => {
    // Clear old messages if there was a previous task
    const { mainTaskId } = get();
    if (mainTaskId) {
      get().clearMessages(mainTaskId);
    }

    // Close doc sidebar when creating new conversation
    get().closeDoc();

    // Reset to empty state - server will create new task on first message
    set({ mainTaskId: "", activeTaskId: null });
  },

  handleSessionHistories: (histories) => {
    set({ taskHistories: histories });
  },
});
