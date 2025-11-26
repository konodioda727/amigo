import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";

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

    const selectItem = useCallback((index: number) => {
      const item = items[index];
      console.log("[MentionList] selectItem called:", { index, item, items });
      if (item) {
        console.log("[MentionList] calling command with item:", item);
        command(item);
      }
    }, [items, command]);

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
    }), [items.length, selectItem, selectedIndex]);

    return (
      <div 
        role="listbox"
        aria-label="会话选择"
        className="bg-white border border-neutral-200 rounded-lg shadow-md overflow-hidden z-[1] w-80"
      >
        {items.length > 0 ? (
          <div className="py-1" role="presentation">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                className={`w-full h-9 px-3 flex items-center gap-3 transition-colors duration-150 ${
                  index === selectedIndex
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-neutral-100 text-neutral-900"
                }`}
                onClick={() => selectItem(index)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectItem(index);
                  }
                }}
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
          <div className="text-sm text-neutral-600 px-3 py-4 text-center">
            无可用会话
          </div>
        )}
      </div>
    );
  }
);

MentionList.displayName = "MentionList";
