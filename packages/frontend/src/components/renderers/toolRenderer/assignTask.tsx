import type React from "react";
import type { ToolRendererProps } from ".";

const  AssignTask: React.FC<ToolRendererProps<"assignTasks">> = (props) => {
  const { params, toolOutput, error, updateTime } = props;
  return (
    <div className="chat chat-start mb-2">
      <div className="chat-bubble bg-accent text-accent-content">
        <div className="font-bold mb-2">分配任务工具</div>
        <div className="text-sm mb-2">
          <strong>参数:</strong>
          <pre className="bg-base-200 rounded p-2">{JSON.stringify(params, null, 2)}</pre>
        </div>
        {toolOutput && (
          <div className="mt-2 text-success">
            <strong>输出:</strong> {JSON.stringify(toolOutput)}
          </div>
        )}
        {error && (
          <div className="mt-2 text-error">
            <strong>错误:</strong> {error}
          </div>
        )}
        <div className="text-xs opacity-50 mt-2">
          {updateTime && new Date(updateTime).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default AssignTask;
