import type { MutableRefObject } from "react";
import type { MentionSuggestionRenderProps } from "./types";

type MentionSuggestionConfig = {
  getItems: (query: string) => Array<{ id: string; label: string }>;
  isSuggestionActiveRef: MutableRefObject<boolean>;
};

export const createMentionSuggestion = ({
  getItems,
  isSuggestionActiveRef,
}: MentionSuggestionConfig) => ({
  items: ({ query }: { query: string }) => getItems(query).slice(0, 10),
  render: () => {
    let component: HTMLDivElement | null = null;
    let popup: HTMLDivElement | null = null;

    return {
      onStart: (props: MentionSuggestionRenderProps) => {
        isSuggestionActiveRef.current = true;

        component = document.createElement("div");
        component.className =
          "mention-suggestions bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto";

        popup = document.createElement("div");
        popup.className = "fixed z-50";
        popup.appendChild(component);
        document.body.appendChild(popup);

        const { start } = getPopupPosition(props);
        popup.style.left = `${start.left}px`;
        popup.style.top = `${start.bottom + 8}px`;
      },

      onUpdate: (props: MentionSuggestionRenderProps) => {
        if (!component) {
          return;
        }
        const suggestionContainer = component;

        suggestionContainer.innerHTML = "";

        if (props.items.length === 0) {
          const noResults = document.createElement("div");
          noResults.className = "px-3 py-2 text-sm text-gray-500";
          noResults.textContent = "No suggestions";
          suggestionContainer.appendChild(noResults);
          return;
        }

        props.items.forEach((item, index) => {
          const button = document.createElement("button");
          button.className = `w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
            index === props.selectedIndex ? "bg-blue-50 text-blue-600" : "text-gray-900"
          }`;
          button.textContent = item.label;
          button.onclick = () => props.command(item);
          suggestionContainer.appendChild(button);
        });
      },

      onKeyDown: (props: Pick<MentionSuggestionRenderProps, "event">) => {
        if (props.event.key === "Escape") {
          isSuggestionActiveRef.current = false;
          return true;
        }

        return false;
      },

      onExit: () => {
        isSuggestionActiveRef.current = false;
        if (popup?.parentNode) {
          popup.parentNode.removeChild(popup);
        }
      },
    };
  },
});

const getPopupPosition = (props: MentionSuggestionRenderProps) => {
  const { from } = props.range;
  const start = props.editor.view.coordsAtPos(from);
  return { start };
};
