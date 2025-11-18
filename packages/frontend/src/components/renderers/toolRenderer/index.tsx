import type { ToolNames } from "@amigo/types";
import type React from "react";
import type { FrontendToolMessageType } from "@/messages/types";
import AssignTask from "./assignTask";

export type ToolRendererProps<T extends ToolNames> = FrontendToolMessageType<T> & { updateTime?: number };
type ToolRednerers = {
  [K in ToolNames]?: React.FC<ToolRendererProps<K>>;
};
// 工具类型映射，可扩展
const toolRendererMap: ToolRednerers = {
  // 例如：exampleTool: ToolRenderer_ExampleTool,
  assignTasks: AssignTask
};

const DefaultToolRenderer: React.FC<ToolRendererProps<any>> = ({
  toolName,
  params,
  toolOutput,
  error,
  updateTime,
}) => {
  const paramsStr = JSON.stringify(params, null, 2);
  
  // 如果有错误，使用错误样式
  if (error) {
    return (
      <div className="flex flex-col items-center w-full mb-4">
        <div className="w-full max-w-4xl">
          <div className="alert alert-error shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h3 className="font-bold">工具调用失败：{toolName}</h3>
              <div className="text-sm mt-2 whitespace-pre-wrap">{error}</div>
            </div>
          </div>
          <div className="text-xs opacity-50 mt-2 text-center">
            {updateTime && new Date(updateTime).toLocaleTimeString()}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="chat chat-start mb-2">
      <div className="chat-image avatar">
        <div className="w-10 rounded-full">
          <img
            alt="AI"
            src="https://daisyui.com/images/stock/photo-1565098772267-60af42b81ef2.jpg"
          />
        </div>
      </div>
      <div className="chat-bubble bg-accent text-accent-content">
        <div className="text-xs opacity-50">
          {updateTime && new Date(updateTime).toLocaleTimeString()}
        </div>
        <div className="font-bold">工具: {toolName}</div>
        <div className="text-sm whitespace-pre-wrap">{paramsStr}</div>
        {toolOutput && <div className="mt-2 text-success">输出: {JSON.stringify(toolOutput)}</div>}
      </div>
    </div>
  );
};

const ToolRenderer: React.FC<ToolRendererProps<any>> = (props) => {
  const { toolName } = props;
  const CustomRenderer = toolRendererMap[toolName as ToolNames];
  if (CustomRenderer) {
    //@ts-expect-error
    return <CustomRenderer {...props} />;
  }
  return <DefaultToolRenderer {...props} />;
};

export default ToolRenderer;
