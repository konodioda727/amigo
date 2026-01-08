import type { SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import type { StateCreator } from "zustand";
import type { DisplayMessageType } from "../../messages/types";
import type { WebSocketStore } from "../websocket";

export interface TaskState {
  rawMessages: Array<WebSocketMessage<SERVER_SEND_MESSAGE_NAME> | WebSocketMessage<any>>;
  displayMessages: DisplayMessageType[];
  isLoading: boolean;
  lastUpdateTime: number;
}

export interface TaskSlice {
  tasks: Record<string, TaskState>;
  activeTaskId: string | null;
  mainTaskId: string;
  taskHistories: Array<{ taskId: string; title: string; updatedAt: string }>;

  registerTask: (taskId: string) => void;
  unregisterTask: (taskId: string) => void;
  setActiveTask: (taskId: string | null) => void;
  setLoading: (taskId: string, isLoading: boolean) => void;
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

  setActiveTask: (taskId) => {
    set({ activeTaskId: taskId });
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

    if (taskId === currentTaskId) return;

    set({ mainTaskId: taskId });
    get().registerTask(taskId);

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
    const { mainTaskId } = get();
    get().clearMessages(mainTaskId);
    set({ mainTaskId: "", activeTaskId: null });
  },

  handleSessionHistories: (histories) => {
    set({ taskHistories: histories });
  },
});
