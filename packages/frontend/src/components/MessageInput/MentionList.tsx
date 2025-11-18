import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export interface SessionInfo {
  id: string;
  type: "main" | "subtask";
  title: string;
  isActive: boolean;
}

interface MentionListProps {
  items: SessionInfo[];
  command: (item: SessionInfo) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          return true;
        }

        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }

        return false;
      },
    }));

    return (
      <div className="dropdown-content menu bg-base-100 rounded-box z-[1] w-64 p-2 shadow-lg border border-base-300">
        {items.length > 0 ? (
          items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`btn btn-ghost btn-sm justify-start gap-2 ${
                index === selectedIndex ? "btn-active" : ""
              }`}
              onClick={() => selectItem(index)}
            >
              <span className="text-lg">{item.type === "main" ? "🏠" : "📋"}</span>
              <span className="truncate">{item.title}</span>
            </button>
          ))
        ) : (
          <div className="text-sm text-base-content/50 p-2">无可用会话</div>
        )}
      </div>
    );
  }
);

MentionList.displayName = "MentionList";
