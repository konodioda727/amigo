import type {
  ContextUsageStatus,
  SERVER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
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
  taskContextUsageMaps: Record<string, ContextUsageStatus | undefined>;
  taskContextMaps: Record<string, unknown>;

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
  setTaskContextUsage: (taskId: string, contextUsage: ContextUsageStatus | undefined) => void;
  setTaskContext: (taskId: string, context: unknown) => void;
  setCreatingConversation: (isCreating: boolean) => void;
  taskStatusMapUpdated: (taskId: string, subTasks: Record<string, any>) => void;
  createNewConversation: () => void;
  handleSessionHistories: (
    histories: Array<{ taskId: string; title: string; updatedAt: string }>,
  ) => void;
}

const createInitialTaskState = (): TaskState => ({
  rawMessages: [],
  displayMessages: [],
  status: "idle",
  lastUpdateTime: Date.now(),
});

const mapSubTaskStatusToTaskStatus = (status?: string): TaskStatus => {
  switch (status) {
    case "running":
      return "streaming";
    case "waiting_user_input":
      return "idle";
    case "wait_review":
      return "waiting_tool_call";
    case "completed":
      return "completed";
    case "failed":
      return "error";
    default:
      return "idle";
  }
};

export const createTaskSlice: StateCreator<WebSocketStore, [], [], TaskSlice> = (set, get) => ({
  tasks: {},
  activeTaskId: null,
  mainTaskId: "",
  isCreatingConversation: false,
  taskHistories: [],
  taskStatusMaps: {},
  taskAutoApproveToolNameMaps: {},
  taskContextUsageMaps: {},
  taskContextMaps: {},

  taskStatusMapUpdated: (taskId: string, subTasks: Record<string, any>) => {
    get().setTaskStatusMap(taskId, subTasks);
  },

  registerTask: (taskId: string) => {
    const { tasks } = get();
    if (!tasks[taskId]) {
      set({
        tasks: {
          ...tasks,
          [taskId]: createInitialTaskState(),
        },
      } as any);
    }
  },

  unregisterTask: (taskId: string) => {
    const {
      tasks,
      taskContextMaps,
      taskContextUsageMaps,
      taskStatusMaps,
      taskAutoApproveToolNameMaps,
    } = get();
    const newTasks = { ...tasks };
    const nextTaskContextMaps = { ...taskContextMaps };
    const nextTaskContextUsageMaps = { ...taskContextUsageMaps };
    const nextTaskStatusMaps = { ...taskStatusMaps };
    const nextTaskAutoApproveToolNameMaps = { ...taskAutoApproveToolNameMaps };
    delete newTasks[taskId];
    delete nextTaskContextMaps[taskId];
    delete nextTaskContextUsageMaps[taskId];
    delete nextTaskStatusMaps[taskId];
    delete nextTaskAutoApproveToolNameMaps[taskId];
    set({
      tasks: newTasks,
      taskContextMaps: nextTaskContextMaps,
      taskContextUsageMaps: nextTaskContextUsageMaps,
      taskStatusMaps: nextTaskStatusMaps,
      taskAutoApproveToolNameMaps: nextTaskAutoApproveToolNameMaps,
    } as any);
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

    // Clear doc state immediately when switching conversations.
    // It will be repopulated by handleTaskHistory if the target conversation has docs.
    get().resetDocState();
    get().hydrateDocStateForTask(taskId);

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
    get().hydrateDocStateForTask(taskId);
  },

  setTaskStatusMap: (taskId: string, subTasks: Record<string, any>) => {
    const { taskStatusMaps, tasks } = get();
    const nextTasks = { ...tasks };
    let hasTaskUpdates = false;

    Object.values(subTasks).forEach((subTask: any) => {
      const subTaskId = subTask?.subTaskId;
      if (!subTaskId) return;

      const mappedStatus = mapSubTaskStatusToTaskStatus(subTask?.status);
      const existingTask = nextTasks[subTaskId];

      if (!existingTask) {
        nextTasks[subTaskId] = {
          ...createInitialTaskState(),
          status: mappedStatus,
        };
        hasTaskUpdates = true;
        return;
      }

      if (existingTask.status !== mappedStatus) {
        nextTasks[subTaskId] = {
          ...existingTask,
          status: mappedStatus,
        };
        hasTaskUpdates = true;
      }
    });

    set({
      taskStatusMaps: {
        ...taskStatusMaps,
        [taskId]: subTasks,
      },
      ...(hasTaskUpdates ? { tasks: nextTasks } : {}),
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

  setTaskContextUsage: (taskId: string, contextUsage: ContextUsageStatus | undefined) => {
    const { taskContextUsageMaps } = get();
    set({
      taskContextUsageMaps: {
        ...taskContextUsageMaps,
        [taskId]: contextUsage,
      },
    } as any);
  },

  setTaskContext: (taskId: string, context: unknown) => {
    const { taskContextMaps } = get();
    set({
      taskContextMaps: {
        ...taskContextMaps,
        [taskId]: context,
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

    // New conversation should not inherit docs from the previous one.
    get().resetDocState();

    // Reset to empty state - server will create new task on first message
    set({
      mainTaskId: "",
      activeTaskId: null,
      isCreatingConversation: false,
      taskContextMaps: {},
      taskContextUsageMaps: {},
      taskStatusMaps: {},
      taskAutoApproveToolNameMaps: {},
    } as any);
  },

  handleSessionHistories: (histories) => {
    set({ taskHistories: histories } as any);
  },
});
