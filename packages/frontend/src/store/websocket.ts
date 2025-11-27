import { create } from "zustand";
import { createConnectionSlice, type ConnectionSlice } from "./slices/connectionSlice";
import { createTaskSlice, type TaskSlice } from "./slices/taskSlice";
import { createMessageSlice, type MessageSlice } from "./slices/messageSlice";
import { createMentionSlice, type MentionSlice } from "./slices/mentionSlice";

export type WebSocketStore = ConnectionSlice & TaskSlice & MessageSlice & MentionSlice;

export const useWebSocketStore = create<WebSocketStore>()((...a) => ({
  ...createConnectionSlice(...a),
  ...createTaskSlice(...a),
  ...createMessageSlice(...a),
  ...createMentionSlice(...a),
}));
