import type { StateCreator } from "zustand";
import type { WebSocketStore } from "../websocket";

export type DocType = "requirements" | "design" | "taskList";

export interface DocState {
  isOpen: boolean;
  activeDoc: DocType;
  documents: Record<DocType, { content: string | null; title: string | null }>;
}

export const createEmptyDocuments = (): DocState["documents"] => ({
  requirements: { content: null, title: "Requirements" },
  design: { content: null, title: "Design" },
  taskList: { content: null, title: "Task List" },
});

export const createInitialDocState = (): DocState => ({
  isOpen: false,
  activeDoc: "taskList",
  documents: createEmptyDocuments(),
});

export interface DocSlice {
  docState: DocState;
  setDocState: (state: Partial<DocState>) => void;
  resetDocState: () => void;
  toggleDoc: () => void;
  openDoc: () => void;
  closeDoc: () => void;
  setDocContent: (content: string, title?: string, type?: DocType) => void;
  setActiveDoc: (type: DocType) => void;
  updateDocContent: (type: DocType, content: string) => void;
}

export const createDocSlice: StateCreator<WebSocketStore, [], [], DocSlice> = (set, get) => ({
  docState: createInitialDocState(),

  setDocState: (state) => {
    set({
      docState: {
        ...get().docState,
        ...state,
      },
    });
  },

  resetDocState: () => {
    set({
      docState: createInitialDocState(),
    });
  },

  toggleDoc: () => {
    const { isOpen } = get().docState;
    set({
      docState: {
        ...get().docState,
        isOpen: !isOpen,
      },
    });
  },

  openDoc: () => {
    set({
      docState: {
        ...get().docState,
        isOpen: true,
      },
    });
  },

  closeDoc: () => {
    set({
      docState: {
        ...get().docState,
        isOpen: false,
      },
    });
  },

  setDocContent: (content, title, type) => {
    // Default to taskList if no type specified, to maintain backward compatibility
    // or try to infer from title if possible, but simplest is default
    const targetType = type || "taskList";

    const updatedDocuments = {
      ...get().docState.documents,
      [targetType]: {
        content,
        title: title || get().docState.documents[targetType].title,
      },
    };

    // Only open sidebar if there's actual content in any document
    const hasAnyContent = Object.values(updatedDocuments).some((doc) => doc.content);

    set({
      docState: {
        ...get().docState,
        isOpen: hasAnyContent,
        activeDoc: targetType,
        documents: updatedDocuments,
      },
    });
  },

  setActiveDoc: (type) => {
    set({
      docState: {
        ...get().docState,
        activeDoc: type,
      },
    });
  },

  updateDocContent: (type, content) => {
    set({
      docState: {
        ...get().docState,
        documents: {
          ...get().docState.documents,
          [type]: {
            ...get().docState.documents[type],
            content,
          },
        },
      },
    });
  },
});
