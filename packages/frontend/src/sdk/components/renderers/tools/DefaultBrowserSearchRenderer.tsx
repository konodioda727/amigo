import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

/**
 * Default renderer for browserSearch tool
 */
export const DefaultBrowserSearchRenderer: React.FC<ToolMessageRendererProps<"browserSearch">> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError, partial } = message;
  const { query } = params;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;

  return (
    <ToolAccordion
      title={`搜索: ${query}`}
      isLoading={isLoading}
      hasError={hasError}
      error={error ? `浏览器操作失败：${error}` : error}
    >
      {isCompleted && (
        <div className="flex flex-col gap-2">
          {toolOutput.results && toolOutput.results.length > 0 ? (
            toolOutput.results.map((res: any) => (
              <a
                key={res.url}
                href={res.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-neutral-700 transition-colors hover:border-blue-200 hover:text-blue-500"
                title={res.snippet || res.title}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 flex-shrink-0" />
                <span className="truncate">{res.title || res.url}</span>
              </a>
            ))
          ) : (
            <span className="italic text-neutral-500">没有找到相关结果</span>
          )}
        </div>
      )}
    </ToolAccordion>
  );
};
