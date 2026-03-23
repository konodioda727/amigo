import type { UserSendMessageData } from "@amigo-llm/types";
import type { ReactNode } from "react";

export interface MessageInputProps {
  taskId?: string;
  className?: string;
  placeholder?: string;
  onSend?: (message: string) => void;
  createTaskContext?: unknown;
  modelConfigSnapshot?:
    | UserSendMessageData<"createTask">["modelConfigSnapshot"]
    | UserSendMessageData<"userSendMessage">["modelConfigSnapshot"];
  disabled?: boolean;
  showMentions?: boolean;
  bottomAccessory?: ReactNode;
}

export interface MessageInputRef {
  focus: () => void;
  insertMention: (sessionId: string, sessionTitle: string) => void;
  clear: () => void;
}

export type MentionSuggestionItem = {
  id: string;
  label: string;
};

export type MentionSuggestionRenderProps = {
  command: (item: MentionSuggestionItem) => void;
  editor: {
    view: {
      coordsAtPos: (position: number) => { left: number; bottom: number };
    };
  };
  event: KeyboardEvent;
  items: MentionSuggestionItem[];
  range: {
    from: number;
  };
  selectedIndex: number;
};
