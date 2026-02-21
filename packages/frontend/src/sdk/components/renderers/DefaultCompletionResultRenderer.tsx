import { CheckCircle, ChevronDown, ChevronRight } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import type { CompletionResultRendererProps } from "../../types/renderers";

/**
 * Default renderer for completion result message type
 */
export const DefaultCompletionResultRenderer: React.FC<CompletionResultRendererProps> = ({
  message,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-2">
      <div className="border border-green-200 rounded-xl overflow-hidden bg-white shadow-sm max-w-3xl">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 w-full px-4 py-3 text-left cursor-pointer hover:bg-green-50/50 transition-colors"
        >
          <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center shrink-0">
            <CheckCircle className="w-4 h-4 text-green-600" />
          </div>
          <span className="flex-1 font-semibold text-sm text-gray-900 tracking-wide">
            任务执行成功
          </span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
        </button>
        {isExpanded && (
          <div className="p-4 bg-white border-t border-green-100 text-gray-700 break-words text-sm leading-relaxed prose prose-sm max-w-none prose-neutral">
            <Streamdown>{message.result}</Streamdown>
          </div>
        )}
      </div>
    </div>
  );
};
