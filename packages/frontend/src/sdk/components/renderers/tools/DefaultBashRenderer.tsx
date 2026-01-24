import { CheckCircle, Terminal, XCircle } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

export const DefaultBashRenderer: React.FC<ToolMessageRendererProps<"bash">> = ({ message }) => {
  const { params, toolOutput, error, hasError } = message;
  const { command, workingDir } = params;

  return (
    <div className="my-2 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm max-w-3xl">
      {/* Header */}
      <div className="bg-gray-50/50 px-3 py-2 flex items-center justify-between gap-2 border-b border-gray-200">
        <div className="flex items-center gap-2 overflow-hidden">
          <Terminal className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-gray-900 truncate">Bash Command</span>
          {workingDir && (
            <span
              className="text-xs text-gray-500 font-mono truncate max-w-[200px]"
              title={workingDir}
            >
              in {workingDir}
            </span>
          )}
        </div>
        <div>
          {hasError ? (
            <div className="px-2 py-0.5 border border-red-200 rounded-full text-[10px] font-medium bg-red-50 text-red-600 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Failed
            </div>
          ) : toolOutput ? (
            <div className="px-2 py-0.5 border border-green-200 rounded-full text-[10px] font-medium bg-green-50 text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Success
            </div>
          ) : (
            <span className="loading loading-dots loading-xs text-gray-400" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-0">
        <div className="mockup-code bg-[#1e1e1e] text-gray-300 before:hidden px-4 py-3 text-xs min-w-0 rounded-none">
          <pre className="flex">
            <span className="text-green-500 mr-2 select-none font-bold">$</span>
            <code className="whitespace-pre-wrap break-all font-mono font-medium">{command}</code>
          </pre>

          {(toolOutput?.output || error) && (
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              {error ? (
                <pre className="text-red-400 whitespace-pre-wrap break-all font-medium">
                  {error}
                </pre>
              ) : (
                <pre className="text-gray-300 whitespace-pre-wrap break-all max-h-64 overflow-y-auto custom-scrollbar font-medium">
                  {toolOutput?.output || <span className="text-gray-600 italic">No output</span>}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Result Meta */}
      {toolOutput && (
        <div className="px-3 py-1.5 bg-gray-50 text-[10px] text-gray-500 font-medium border-t border-gray-200 flex justify-between">
          <span>Exit Code: {toolOutput.exitCode ?? 0}</span>
          {message.updateTime && <span>{new Date(message.updateTime).toLocaleTimeString()}</span>}
        </div>
      )}
    </div>
  );
};
