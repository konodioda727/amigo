import type { StateCreator } from "zustand";
import type { WebSocketStore } from "../websocket";

export interface MentionSlice {
  pendingMention: { taskId: string; title: string } | null;
  followupQueue: Array<{ taskId: string; title: string }>;
  clearInputRequested: boolean;

  requestMention: (taskId: string, title: string) => void;
  clearPendingMention: () => void;
  updateFollowupQueue: () => void;
  mentionNextInQueue: () => void;
  acknowledgeClearInput: () => void;
}

export const createMentionSlice: StateCreator<WebSocketStore, [], [], MentionSlice> = (
  set,
  get,
) => ({
  pendingMention: null,
  followupQueue: [],
  clearInputRequested: false,

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

    for (const msg of displayMessages) {
      if (msg.type === "tool") {
        const toolMsg = msg as {
          type: "tool";
          toolName: string;
          params: Record<string, unknown>;
        };

        if (toolMsg.toolName === "assignTasks") {
          const params = toolMsg.params as {
            tasklist?: Array<{ taskId?: string; target?: string; completed?: boolean }>;
          };
          const tasklist = params.tasklist || [];

          tasklist.forEach((task, idx: number) => {
            if (task.taskId && !task.completed) {
              const subTaskState = state.tasks[task.taskId];
              const subTaskMessages = subTaskState?.displayMessages || [];
              const lastSubTaskMessage = subTaskMessages[subTaskMessages.length - 1];

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
      state.clearPendingMention();
      set({ clearInputRequested: true });
    }
  },

  acknowledgeClearInput: () => {
    set({ clearInputRequested: false });
  },
});
