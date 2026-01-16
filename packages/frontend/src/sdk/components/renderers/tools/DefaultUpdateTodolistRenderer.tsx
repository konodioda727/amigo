import { CheckCircle2, Circle, ListTodo } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

/**
 * Default renderer for updateTodolist tool
 */
export const DefaultUpdateTodolistRenderer: React.FC<
  ToolMessageRendererProps<"updateTodolist">
> = ({ message }) => {
  const { params, updateTime } = message;

  // Parse markdown checklist with error handling
  const parseChecklist = (markdown: string | undefined) => {
    if (!markdown || typeof markdown !== "string") {
      return [];
    }

    try {
      const lines = markdown
        .split("\n")
        .filter((line) => line.trim().startsWith("- [") || line.trim().startsWith("* ["));
      return lines.map((line) => {
        const isCompleted = line.includes("[x]") || line.includes("[X]");
        const target = line.replace(/^[-*]\s*\[[xX\s]\]\s*/, "").trim();
        return { target, completed: isCompleted };
      });
    } catch (error) {
      console.error("[DefaultUpdateTodolistRenderer] Failed to parse checklist:", error);
      return [];
    }
  };

  const checklist = parseChecklist(params?.todolist);
  const total = checklist.length;
  const completed = checklist.filter((item) => item.completed).length;

  // If no valid checklist, show loading state
  if (total === 0) {
    return (
      <div className="chat chat-start mb-4">
        <div className="chat-bubble bg-neutral-100 text-neutral-900 rounded-xl px-4 py-3 shadow-none max-w-[85%] break-words overflow-hidden">
          <div className="flex items-center gap-1.5 font-medium text-sm">
            <ListTodo className="w-4 h-4" />
            <span>待办事项</span>
          </div>
          <div className="mt-2 text-xs text-neutral-500">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat chat-start mb-4">
      <div className="chat-bubble bg-neutral-100 text-neutral-900 rounded-xl px-4 py-3 shadow-none max-w-[85%] break-words overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 font-medium text-sm">
            <ListTodo className="w-4 h-4" />
            <span>待办事项</span>
          </div>
          <div className="text-xs text-neutral-600">
            {completed}/{total} 已完成
          </div>
        </div>

        <div className="space-y-2">
          {checklist.map((item) => (
            <div key={item.target} className="flex items-start gap-2">
              {item.completed ? (
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5" />
              )}
              <span
                className={`text-sm leading-relaxed ${
                  item.completed ? "text-neutral-500 line-through" : "text-neutral-900"
                }`}
              >
                {item.target}
              </span>
            </div>
          ))}
        </div>
      </div>

      {updateTime && (
        <div className="chat-footer opacity-50">{new Date(updateTime).toLocaleTimeString()}</div>
      )}
    </div>
  );
};
