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
    if (!state.mainTaskId) {
      set({ followupQueue: [] });
      return;
    }
    // Follow-up mentions are not derived from tool payloads in the current workflow.
    set({ followupQueue: [] });
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
