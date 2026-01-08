import { AlertCircle, CheckCircle, ExternalLink, Globe } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

/**
 * Default renderer for browserSearch tool
 */
export const DefaultBrowserSearchRenderer: React.FC<ToolMessageRendererProps<"browserSearch">> = ({
  message,
  taskId: _taskId,
  isLatest: _isLatest,
}) => {
  const { params, toolOutput, error, hasError } = message;

  // If there's an error, show error message
  if (hasError && error) {
    return (
      <div className="flex items-start gap-2 py-2 text-error text-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>浏览器操作失败：{error}</span>
      </div>
    );
  }

  const { query, url, action = "search" } = params;
  const isCompleted = !!toolOutput;

  // Get action type description
  const getActionText = () => {
    switch (action) {
      case "search":
        return "搜索";
      case "navigate":
        return "访问网页";
      case "extract":
        return "提取内容";
      default:
        return "浏览器操作";
    }
  };

  return (
    <div className="py-2">
      {/* Title row */}
      <div className="flex items-center gap-2 text-sm mb-2">
        <Globe className="w-4 h-4 text-primary" />
        <span className="font-medium text-neutral-700">{getActionText()}</span>
        {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-success" />}
      </div>

      {/* Parameter info */}
      <div className="pl-6 space-y-1 text-sm">
        {action === "search" && query && (
          <div className="text-neutral-600">
            <span className="text-neutral-400">关键词：</span>
            <span className="font-medium">{query}</span>
          </div>
        )}

        {action === "navigate" && url && (
          <div className="text-neutral-600 flex items-center gap-1">
            <span className="text-neutral-400">URL：</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              {url}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {action === "extract" && (
          <div className="text-neutral-600">
            <span className="text-neutral-400">操作：</span>
            <span>提取当前页面内容</span>
          </div>
        )}

        {/* Result info */}
        {isCompleted && toolOutput && (
          <div className="mt-2 p-3 bg-base-200 rounded-lg">
            {toolOutput.title && (
              <div className="font-medium text-neutral-700 mb-1">{toolOutput.title}</div>
            )}
            {toolOutput.url && (
              <div className="text-xs text-neutral-500 mb-2 flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                <a
                  href={toolOutput.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {toolOutput.url}
                </a>
              </div>
            )}
            <div className="text-sm text-neutral-600 whitespace-pre-wrap max-h-60 overflow-y-auto">
              {toolOutput.content}
            </div>
          </div>
        )}
      </div>

      {/* Error info (non-fatal error) */}
      {error && !hasError && (
        <div className="flex items-center gap-2 text-warning text-xs mt-2 pl-6">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
