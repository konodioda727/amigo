import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import tippy from "tippy.js";
import type { Instance as TippyInstance } from "tippy.js";
import "tippy.js/dist/tippy.css";
import { MentionList, type SessionInfo, type MentionListRef } from "./MentionList";

interface UseMentionSuggestionProps {
  getActiveSessions: () => SessionInfo[];
  onSessionSelect: (sessionId: string) => void;
  onSuggestionStart?: () => void;
  onSuggestionExit?: () => void;
}

export const useMentionSuggestion = ({
  getActiveSessions,
  onSessionSelect,
  onSuggestionStart,
  onSuggestionExit,
}: UseMentionSuggestionProps): Omit<SuggestionOptions, "editor"> => {
  return {
    char: "/",
    items: ({ query }) => {
      const sessions = getActiveSessions();
      return sessions.filter((session) =>
        session.title.toLowerCase().includes(query.toLowerCase())
      );
    },
    render: () => {
      let component: ReactRenderer<MentionListRef> | undefined;
      let popup: TippyInstance[] | undefined;

      return {
        onStart: (props: SuggestionProps) => {
          component = new ReactRenderer(MentionList, {
            props: {
              items: props.items as SessionInfo[],
              command: (item: SessionInfo) => {
                props.command(item);
              },
            },
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            onShow: () => {
              // Only set active when popup is actually shown
              onSuggestionStart?.();
            },
            onHide: () => {
              // Set inactive when popup is hidden
              onSuggestionExit?.();
            },
          });
        },

        onUpdate(props: SuggestionProps) {
          component?.updateProps({
            items: props.items as SessionInfo[],
            command: (item: SessionInfo) => {
              props.command(item);
            },
          });

          if (!props.clientRect) {
            return;
          }

          popup?.[0]?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        },

        onKeyDown(props: { event: KeyboardEvent }) {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }

          // Delegate keyboard handling to the MentionList component
          return component?.ref?.onKeyDown?.(props) ?? false;
        },

        onExit() {
          popup?.[0]?.destroy();
          component?.destroy();
          // Ensure we reset the state when suggestion exits
          onSuggestionExit?.();
        },
      };
    },
    command: ({ editor, range, props }) => {
      const session = props as SessionInfo;
      
      onSessionSelect(session.id);
      
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "mention",
            attrs: {
              id: session.id,
              label: session.title,
            },
          },
          {
            type: "text",
            text: " ",
          },
        ])
        .run();
    },
  };
};
