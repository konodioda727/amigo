import type { StateCreator } from "zustand";
import type { WebSocketStore } from "../websocket";

export type DocType = "requirements" | "design" | "taskList";

export interface DocState {
  isOpen: boolean;
  activeDoc: DocType;
  documents: Record<DocType, { content: string | null; title: string | null }>;
}

export interface TaskDocSnapshotEntry {
  content: string;
  title: string | null;
}

export type TaskDocSnapshot = Partial<Record<DocType, TaskDocSnapshotEntry>>;

const DOC_PHASES: DocType[] = ["requirements", "design", "taskList"];

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
  taskDocSnapshots: Record<string, TaskDocSnapshot>;
  setDocState: (state: Partial<DocState>) => void;
  resetDocState: () => void;
  toggleDoc: () => void;
  openDoc: () => void;
  closeDoc: () => void;
  setDocContent: (content: string, title?: string, type?: DocType) => void;
  setActiveDoc: (type: DocType) => void;
  updateDocContent: (type: DocType, content: string) => void;
  cacheTaskDocuments: (
    taskId: string,
    documents: Partial<Record<DocType, string | TaskDocSnapshotEntry | null | undefined>>,
  ) => void;
  hydrateDocStateForTask: (taskId: string) => void;
}

export const createDocSlice: StateCreator<WebSocketStore, [], [], DocSlice> = (set, get) => ({
  docState: createInitialDocState(),
  taskDocSnapshots: {},

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

  cacheTaskDocuments: (taskId, documents) => {
    if (!taskId.trim()) {
      return;
    }

    const currentSnapshots = get().taskDocSnapshots;
    const existingSnapshot = currentSnapshots[taskId] || {};
    const nextSnapshot: TaskDocSnapshot = { ...existingSnapshot };
    let hasUpdates = false;

    for (const phase of DOC_PHASES) {
      const rawValue = documents[phase];
      if (!rawValue) {
        continue;
      }

      const normalizedEntry =
        typeof rawValue === "string"
          ? { content: rawValue, title: existingSnapshot[phase]?.title || null }
          : typeof rawValue.content === "string"
            ? {
                content: rawValue.content,
                title: rawValue.title ?? existingSnapshot[phase]?.title ?? null,
              }
            : null;
      if (!normalizedEntry) {
        continue;
      }

      const previousEntry = existingSnapshot[phase];
      if (
        previousEntry?.content === normalizedEntry.content &&
        previousEntry?.title === normalizedEntry.title
      ) {
        continue;
      }

      nextSnapshot[phase] = normalizedEntry;
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return;
    }

    set({
      taskDocSnapshots: {
        ...currentSnapshots,
        [taskId]: nextSnapshot,
      },
    });
  },

  hydrateDocStateForTask: (taskId) => {
    const snapshot = get().taskDocSnapshots[taskId];
    if (!snapshot) {
      return;
    }

    const documents = createEmptyDocuments();
    let activeDoc: DocType = "taskList";
    let hasAnyContent = false;

    for (const phase of DOC_PHASES) {
      const entry = snapshot[phase];
      if (!entry?.content) {
        continue;
      }

      documents[phase] = {
        content: entry.content,
        title: entry.title || documents[phase].title,
      };
      activeDoc = phase;
      hasAnyContent = true;
    }

    if (!hasAnyContent) {
      return;
    }

    set({
      docState: {
        ...get().docState,
        isOpen: true,
        activeDoc,
        documents,
      },
    });
  },
});
