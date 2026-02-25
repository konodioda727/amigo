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
  isCreatingConversation: boolean;
  taskHistories: Array<{ taskId: string; title: string; updatedAt: string }>;
  taskStatusMaps: Record<string, Record<string, any>>;
  taskAutoApproveToolNameMaps: Record<string, string[]>;

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
  setCurrentTaskIdsForNewConversation: (taskId: string) => void;
  setTaskStatusMap: (taskId: string, subTasks: Record<string, any>) => void;
  setTaskAutoApproveToolNames: (taskId: string, toolNames: string[]) => void;
  setCreatingConversation: (isCreating: boolean) => void;
  taskStatusMapUpdated: (taskId: string, subTasks: Record<string, any>) => void;
  createNewConversation: () => void;
  handleSessionHistories: (
    histories: Array<{ taskId: string; title: string; updatedAt: string }>,
  ) => void;
}

export const createTaskSlice: StateCreator<WebSocketStore, [], [], TaskSlice> = (set, get) => ({
  tasks: {},
  activeTaskId: null,
  mainTaskId: "",
  isCreatingConversation: false,
  taskHistories: [],
  taskStatusMaps: {},
  taskAutoApproveToolNameMaps: {},

  taskStatusMapUpdated: (taskId: string, subTasks: Record<string, any>) => {
    get().setTaskStatusMap(taskId, subTasks);
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
            status: "idle",
            lastUpdateTime: Date.now(),
          },
        },
      } as any);
    }
  },

  unregisterTask: (taskId: string) => {
    const { tasks } = get();
    const newTasks = { ...tasks };
    delete newTasks[taskId];
    set({ tasks: newTasks } as any);
  },

  setActiveTask: (taskId) => {
    const { socket, activeTaskId } = get();
    if (taskId === activeTaskId) return;

    set({ activeTaskId: taskId } as any);

    if (taskId) {
      get().registerTask(taskId);
    }

    if (socket && socket.readyState === WebSocket.OPEN && taskId) {
      socket.send(
        JSON.stringify({
          type: "loadTask",
          data: { taskId },
        }),
      );
    }
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
    } as any);
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
    } as any);
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
    } as any);
  },

  setMainTaskId: (taskId) => {
    const { socket, mainTaskId: currentTaskId } = get();

    if (taskId === currentTaskId) return;

    set({ mainTaskId: taskId, activeTaskId: taskId } as any);
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

  setCurrentTaskIdsForNewConversation: (taskId) => {
    if (!taskId || taskId.trim() === "") return;

    const { mainTaskId, activeTaskId } = get();
    const shouldUpdateIds = mainTaskId !== taskId || activeTaskId !== taskId;

    if (shouldUpdateIds) {
      set({ mainTaskId: taskId, activeTaskId: taskId } as any);
    }

    get().registerTask(taskId);
  },

  setTaskStatusMap: (taskId: string, subTasks: Record<string, any>) => {
    const { taskStatusMaps } = get();
    set({
      taskStatusMaps: {
        ...taskStatusMaps,
        [taskId]: subTasks,
      },
    } as any);
  },

  setTaskAutoApproveToolNames: (taskId: string, toolNames: string[]) => {
    const { taskAutoApproveToolNameMaps } = get();
    set({
      taskAutoApproveToolNameMaps: {
        ...taskAutoApproveToolNameMaps,
        [taskId]: [...toolNames],
      },
    } as any);
  },

  setCreatingConversation: (isCreatingConversation) => {
    set({ isCreatingConversation } as any);
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
    set({ mainTaskId: "", activeTaskId: null, isCreatingConversation: false } as any);
  },

  handleSessionHistories: (histories) => {
    set({ taskHistories: histories } as any);
  },
});
