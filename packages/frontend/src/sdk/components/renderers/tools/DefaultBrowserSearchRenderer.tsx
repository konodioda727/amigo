import { AlertCircle, ChevronDown, ChevronUp, Globe } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

/**
 * Default renderer for browserSearch tool
 */
export const DefaultBrowserSearchRenderer: React.FC<ToolMessageRendererProps<"browserSearch">> = ({
  message,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { params, toolOutput, error, hasError, partial } = message;

  // If there's an error, show error message
  if (hasError && error) {
    return (
      <div className="flex items-start gap-2 py-2 text-error text-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>浏览器操作失败：{error}</span>
      </div>
    );
  }

  const { query } = params;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;

  return (
    <div className="flex flex-col mb-2 px-2 max-w-[85%]">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-600 transition-colors w-fit pb-1"
      >
        <span className="shrink-0">
          <Globe size={14} />
        </span>
        <span className="truncate max-w-[200px] text-left">
          <span className={isLoading ? "loading-shimmer" : ""}>{`搜索: ${query}`}</span>
        </span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isExpanded && isCompleted && (
        <div className="transition-all duration-300 ease-in-out border-l-2 border-neutral-200 ml-1.5 pl-4 py-1 text-sm text-neutral-500 flex flex-col gap-2">
          {toolOutput.results && toolOutput.results.length > 0 ? (
            toolOutput.results.map((res: any) => (
              <a
                key={res.url}
                href={res.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-500 hover:underline transition-colors flex items-center gap-1.5"
                title={res.snippet || res.title}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 flex-shrink-0" />
                <span className="truncate">{res.title || res.url}</span>
              </a>
            ))
          ) : (
            <span className="italic">没有找到相关结果</span>
          )}
        </div>
      )}
    </div>
  );
};
