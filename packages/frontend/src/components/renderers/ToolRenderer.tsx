import React from "react";
import { FrontendToolMessageType } from "@/messages/types";

type ToolRendererProps = FrontendToolMessageType & { updateTime?: number };

// 工具类型映射，可扩展
const toolRendererMap: Record<string, React.FC<ToolRendererProps>> = {
  // 例如：exampleTool: ToolRenderer_ExampleTool,
};

const DefaultToolRenderer: React.FC<ToolRendererProps> = ({
  toolName,
  params,
  toolOutput,
  error,
  updateTime,
}) => {
  const paramsStr = JSON.stringify(params, null, 2);
  return (
    <div className="chat chat-start mb-2">
      <div className="chat-image avatar">
        <div className="w-10 rounded-full">
          <img alt="AI" src="https://daisyui.com/images/stock/photo-1565098772267-60af42b81ef2.jpg" />
        </div>
      </div>
      <div className="chat-bubble bg-accent text-accent-content">
        <div className="text-xs opacity-50">
          {updateTime && new Date(updateTime).toLocaleTimeString()}
        </div>
        <div className="font-bold">工具: {toolName}</div>
        <div className="text-sm whitespace-pre-wrap">{paramsStr}</div>
        {toolOutput && (
          <div className="mt-2 text-success">输出: {toolOutput}</div>
        )}
        {error && (
          <div className="mt-2 text-error">错误: {error}</div>
        )}
      </div>
    </div>
  );
};

const ToolRenderer: React.FC<ToolRendererProps> = (props) => {
  const { toolName } = props;
  const CustomRenderer = toolRendererMap[toolName];
  if (CustomRenderer) {
    return <CustomRenderer {...props} />;
  }
  return <DefaultToolRenderer {...props} />;
};

export default ToolRenderer;