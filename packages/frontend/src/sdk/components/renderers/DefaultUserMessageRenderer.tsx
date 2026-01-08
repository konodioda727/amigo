import { Loader2 } from "lucide-react";
import type React from "react";
import type { UserMessageRendererProps } from "../../types/renderers";

/**
 * Default renderer for user message type
 */
export const DefaultUserMessageRenderer: React.FC<UserMessageRendererProps> = ({
  message,
  taskId: _taskId,
  isLatest: _isLatest,
}) => {
  const isPending = message.status === "pending";

  return (
    <div className="chat chat-end">
      <div
        className={`
          chat-bubble 
          bg-primary text-white
          rounded-xl px-4 py-3
          shadow-none
          transition-opacity duration-200
          max-w-[85%] break-words overflow-hidden
          ${isPending ? "opacity-70" : "opacity-100"}
        `}
      >
        <div className="flex items-center gap-2">
          <span className="break-words whitespace-pre-wrap">{message.message}</span>
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 opacity-80" />}
        </div>
      </div>
      {message.updateTime && (
        <div className="chat-footer opacity-50">
          {new Date(message.updateTime).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};
