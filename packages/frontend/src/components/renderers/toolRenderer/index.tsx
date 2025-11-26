import { AlertCircle } from "lucide-react";
import type { ToolNames } from "@amigo/types";
import type React from "react";
import type { FrontendToolMessageType } from "@/messages/types";
import AssignTask from "./assignTask";

export type ToolRendererProps<T extends ToolNames> = FrontendToolMessageType<T> & { updateTime?: number };
type ToolRenderers = {
  [K in ToolNames]?: React.FC<ToolRendererProps<K>>;
};
// 工具类型映射，可扩展
const toolRendererMap: ToolRenderers = {
  // 例如：exampleTool: ToolRenderer_ExampleTool,
  assignTasks: AssignTask
};

const DefaultToolRenderer: React.FC<ToolRendererProps<ToolNames>> = ({
  toolName,
  params,
  toolOutput,
  error,
  updateTime,
}) => {
  const paramsStr = JSON.stringify(params, null, 2);
  
  // 如果有错误，使用系统消息样式
  if (error) {
    return (
      <div className="flex justify-center w-full mb-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-error/10 rounded-lg text-error text-xs max-w-[80%]">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-label="错误" />
          <span className="whitespace-pre-wrap">工具调用失败：{toolName} - {error}</span>
          {updateTime && (
            <span className="opacity-50 ml-1">
              {new Date(updateTime).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    );
  }
  
  // 普通工具调用作为系统消息
  return (
    <div className="mb-4 max-w-[80%]">
      <div className="chat chat-start">
        <div className="chat-bubble bg-neutral-100 text-neutral-900 rounded-xl px-4 py-3">
          <div className="font-semibold text-sm mb-2">工具: {toolName}</div>
          <div className="text-xs whitespace-pre-wrap opacity-70">{paramsStr}</div>
          {toolOutput && (
            <div className="mt-2 text-xs text-success">
              输出: {JSON.stringify(toolOutput)}
            </div>
          )}
          {updateTime && (
            <div className="text-xs opacity-50 mt-2">
              {new Date(updateTime).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ToolRenderer: React.FC<ToolRendererProps<ToolNames>> = (props) => {
  const { toolName } = props;
  const CustomRenderer = toolRendererMap[toolName as ToolNames];
  if (CustomRenderer) {
    //@ts-expect-error
    return <CustomRenderer {...props} />;
  }
  return <DefaultToolRenderer {...props} />;
};

export default ToolRenderer;
