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
    allowSpaces: false,
    allowedPrefixes: null, // 允许在任何位置触发，不需要前面有空格
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
            theme: "light-border",
            arrow: false,
            offset: [0, 8],
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
      
      // 先删除触发字符（/xxx）
      editor.chain().focus().deleteRange(range).run();
      
      // 获取当前内容，过滤掉所有已存在的 mention
      const currentContent = editor.getJSON();
      let existingContent = (currentContent.content?.[0]?.content || [])
        .filter((node: { type?: string }) => node.type !== "mention");
      
      // 移除开头的空格文本节点
      if (existingContent.length > 0 && existingContent[0].type === "text") {
        const firstText = existingContent[0].text as string;
        const trimmedText = firstText.replace(/^\s+/, "");
        if (trimmedText) {
          existingContent[0] = { ...existingContent[0], text: trimmedText };
        } else {
          existingContent = existingContent.slice(1);
        }
      }
      
      // 构建内容数组
      const content: unknown[] = [
        {
          type: "mention",
          attrs: {
            id: session.id,
            label: session.title,
          },
        },
      ];
      
      // 只有当有其他内容时才添加空格
      if (existingContent.length > 0) {
        content.push({ type: "text", text: " " });
        content.push(...existingContent);
      }
      
      // 在最前方插入新的 mention（覆盖之前的）
      editor
        .chain()
        .focus()
        .setContent([{ type: "paragraph", content }])
        .focus("end")
        .run();
    },
  };
};
