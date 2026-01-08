import type React from "react";
import { Streamdown } from "streamdown";
import type { CommonMessageRendererProps } from "../../types/renderers";

/**
 * Default renderer for common message type
 */
export const DefaultMessageRenderer: React.FC<CommonMessageRendererProps> = ({
  message,
  taskId: _taskId,
  isLatest: _isLatest,
}) => {
  return (
    <div className="chat chat-start">
      <div className="chat-bubble bg-neutral-100 text-neutral-900 rounded-xl px-4 py-3 shadow-none max-w-[85%] break-words overflow-hidden">
        <Streamdown>{message.message}</Streamdown>
        {message.think && (
          <div className="mt-2 pt-2 border-t border-neutral-200 text-sm text-neutral-600">
            <span className="inline-flex items-center gap-1">
              <span className="text-base">💡</span>
              <span>{message.think}</span>
            </span>
          </div>
        )}
      </div>
      {message.updateTime && (
        <div className="chat-footer opacity-50">
          {new Date(message.updateTime).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};
