import type React from "react";
import type { InterruptRendererProps } from "../../types/renderers";

/**
 * Default renderer for interrupt message type
 */
export const DefaultInterruptRenderer: React.FC<InterruptRendererProps> = ({
  message,
  taskId: _taskId,
  isLatest: _isLatest,
}) => {
  return (
    <div className="flex justify-center w-full mb-3">
      <div className="flex items-center gap-2 px-3 py-2 bg-warning/10 rounded-lg text-warning text-xs max-w-[80%]">
        <span className="whitespace-pre-wrap">任务已中断</span>
        {message.updateTime && (
          <span className="opacity-50 ml-1">
            {new Date(message.updateTime).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
};
