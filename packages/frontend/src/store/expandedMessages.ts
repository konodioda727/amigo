import { create } from "zustand";

interface ExpandedMessagesState {
  expandedMessages: Set<string>;
  toggleExpanded: (messageId: string) => void;
  isExpanded: (messageId: string) => boolean;
}

export const useExpandedMessagesStore = create<ExpandedMessagesState>((set, get) => ({
  expandedMessages: new Set(),
  
  toggleExpanded: (messageId: string) => {
    set((state) => {
      const newSet = new Set(state.expandedMessages);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return { expandedMessages: newSet };
    });
  },
  
  isExpanded: (messageId: string) => {
    return get().expandedMessages.has(messageId);
  },
}));
