import { AlertCircle, CheckCircle, Globe } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

/**
 * Default renderer for browserSearch tool
 */
export const DefaultBrowserSearchRenderer: React.FC<ToolMessageRendererProps<"browserSearch">> = ({
  message,
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

  const { query } = params;
  const isCompleted = !!toolOutput;
  const getActionTitle = () => `搜索并抓取: ${query}`;

  const getDomain = (link: string) => {
    try {
      return new URL(link).hostname;
    } catch {
      return "";
    }
  };

  return (
    <div className="my-2 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm max-w-3xl">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <Globe className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="font-semibold text-sm truncate text-gray-900" title={getActionTitle()}>
            {getActionTitle()}
          </span>
        </div>
        <div>{isCompleted ? <CheckCircle className="w-4 h-4 text-green-500" /> : null}</div>
      </div>

      {/* Content */}
      {isCompleted && (
        <div className="p-3 bg-white border-t border-gray-200">
          <div className="flex items-center gap-2">
            {toolOutput?.url && (
              <img
                src={`https://www.google.com/s2/favicons?domain=${getDomain(toolOutput.url)}`}
                alt="favicon"
                className="w-4 h-4"
              />
            )}
            <div className="flex flex-col overflow-hidden">
              {toolOutput?.title && (
                <div className="text-sm font-semibold truncate text-gray-900">
                  {toolOutput.title}
                </div>
              )}
              {toolOutput?.url && (
                <a
                  href={toolOutput.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 font-medium hover:underline truncate block"
                >
                  {toolOutput.url}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
