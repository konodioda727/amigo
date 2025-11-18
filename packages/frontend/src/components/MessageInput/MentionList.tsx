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
      console.log("[MentionList] selectItem called:", { index, item, items });
      if (item) {
        console.log("[MentionList] calling command with item:", item);
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
      <div className="bg-base-100 rounded-lg z-[1] w-80 shadow-xl border border-base-300 overflow-hidden">
        {items.length > 0 ? (
          <div className="py-1">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`w-full px-3 py-2 flex items-center gap-3 transition-colors ${
                  index === selectedIndex
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-base-200 text-base-content"
                }`}
                onClick={() => selectItem(index)}
              >
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-semibold ${
                    item.type === "main"
                      ? "bg-primary/20 text-primary"
                      : "bg-secondary/20 text-secondary"
                  }`}
                >
                  {item.type === "main" ? "主" : "子"}
                </div>
                <span className="truncate text-sm font-medium">{item.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm text-base-content/50 px-3 py-4 text-center">
            无可用会话
          </div>
        )}
      </div>
    );
  }
);

MentionList.displayName = "MentionList";
