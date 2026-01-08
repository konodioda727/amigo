import type { ToolNames } from "@amigo-llm/types";
import { AlertCircle } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../types/renderers";
import { DefaultAssignTaskRenderer } from "./tools/DefaultAssignTaskRenderer";
import { DefaultBrowserSearchRenderer } from "./tools/DefaultBrowserSearchRenderer";
import { DefaultUpdateTodolistRenderer } from "./tools/DefaultUpdateTodolistRenderer";

// Tool-specific renderer map
const toolRendererMap: {
  [K in ToolNames]?: React.FC<ToolMessageRendererProps<K>>;
} = {
  assignTasks: DefaultAssignTaskRenderer as React.FC<ToolMessageRendererProps<"assignTasks">>,
  updateTodolist: DefaultUpdateTodolistRenderer as React.FC<
    ToolMessageRendererProps<"updateTodolist">
  >,
  browserSearch: DefaultBrowserSearchRenderer as React.FC<
    ToolMessageRendererProps<"browserSearch">
  >,
};

/**
 * Generic tool renderer for tools without custom renderers
 */
const GenericToolRenderer: React.FC<ToolMessageRendererProps<ToolNames>> = ({
  message,
  taskId: _taskId,
  isLatest: _isLatest,
}) => {
  const paramsStr = JSON.stringify(message.params, null, 2);

  // If there's an error, use system message style
  if (message.error) {
    return (
      <div className="flex justify-center w-full mb-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-error/10 rounded-lg text-error text-xs max-w-[80%]">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-label="错误" />
          <span className="whitespace-pre-wrap">
            工具调用失败：{message.toolName} - {message.error}
          </span>
          {message.updateTime && (
            <span className="opacity-50 ml-1">
              {new Date(message.updateTime).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Normal tool call as system message
  return (
    <div className="mb-4 max-w-[80%]">
      <div className="chat chat-start">
        <div className="chat-bubble bg-neutral-100 text-neutral-900 rounded-xl px-4 py-3">
          <div className="font-semibold text-sm mb-2">工具: {message.toolName}</div>
          <div className="text-xs whitespace-pre-wrap opacity-70">{paramsStr}</div>
          {message.toolOutput && (
            <div className="mt-2 text-xs text-success">
              输出: {JSON.stringify(message.toolOutput)}
            </div>
          )}
          {message.updateTime && (
            <div className="text-xs opacity-50 mt-2">
              {new Date(message.updateTime).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Default renderer for tool message type
 * Routes to specific tool renderers or falls back to generic renderer
 */
export const DefaultToolRenderer: React.FC<ToolMessageRendererProps<ToolNames>> = (props) => {
  const { message } = props;
  const CustomRenderer = toolRendererMap[message.toolName as ToolNames];

  if (CustomRenderer) {
    // @ts-expect-error - Type narrowing is complex with generic tool types
    return <CustomRenderer {...props} />;
  }

  return <GenericToolRenderer {...props} />;
};
