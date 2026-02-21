import { ChevronRight, Play, Terminal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSendMessage } from "../hooks/useSendMessage";
import { useTasks } from "../hooks/useTasks";

export interface ToolConfirmationRequestProps {
  taskId?: string;
  className?: string;
}

export const ToolConfirmationRequest = ({
  taskId,
  className = "",
}: ToolConfirmationRequestProps) => {
  const { tasks, mainTaskId } = useTasks();
  const { sendConfirm, sendReject } = useSendMessage();
  const [showParams, setShowParams] = useState(false);

  const currentTaskId = taskId || mainTaskId;
  const currentTask = currentTaskId ? tasks[currentTaskId] : null;

  const isWaiting = currentTask?.status === "waiting_tool_call";
  const pendingToolCall = currentTask?.pendingToolCall;
  const displayMessages = currentTask?.displayMessages;

  const fallbackToolName = useMemo(() => {
    if (!isWaiting) return null;
    if (pendingToolCall) return null;
    if (!displayMessages || displayMessages.length === 0) return null;

    const lastMsg = displayMessages[displayMessages.length - 1];
    if (
      lastMsg &&
      lastMsg.role === "system" &&
      lastMsg.content.includes("Waiting for confirmation to execute tool:")
    ) {
      const match = lastMsg.content.match(/Waiting for confirmation to execute tool: (\w+)/);
      if (match && match[1]) return match[1];
    }
    return null;
  }, [isWaiting, pendingToolCall, displayMessages]);

  if (!isWaiting || !currentTaskId) {
    return null;
  }

  const displayToolName = pendingToolCall?.toolName || fallbackToolName;
  if (!displayToolName) return null;

  return (
    <div className={`tool-confirmation-request mb-3 ${className}`}>
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg py-1.5 px-3 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowParams(!showParams)}
              className={`p-0.5 rounded transition-transform ${showParams ? "rotate-90" : ""}`}
            >
              <ChevronRight size={14} className="text-gray-400" />
            </button>
            <div className="p-1 bg-gray-100 text-gray-500 rounded-md">
              <Terminal size={14} />
            </div>
          </div>

          <div className="text-sm truncate">
            <span className="text-gray-500">Run</span>
            <span className="mx-1.5 font-semibold text-gray-900">{displayToolName}</span>
            <span className="text-gray-500">?</span>

            {pendingToolCall?.params && (
              <button
                onClick={() => setShowParams(!showParams)}
                className="ml-2 text-xs text-blue-500 hover:underline font-medium"
              >
                {showParams ? "Hide details" : "View details"}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            onClick={() => sendReject(currentTaskId)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
            title="Reject"
          >
            <X size={16} />
          </button>
          <button
            onClick={() => sendConfirm(currentTaskId)}
            className="flex items-center gap-1.5 px-3 py-1 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 rounded-md transition-all active:scale-95 shadow-sm"
          >
            <Play size={12} fill="currentColor" />
            Approve
          </button>
        </div>
      </div>

      {showParams && pendingToolCall?.params && (
        <div className="mt-2 bg-gray-50 border border-gray-100 rounded-lg p-3 text-[11px] font-mono text-gray-600 overflow-x-auto max-h-48 shadow-inner animate-in fade-in slide-in-from-top-2">
          <pre className="whitespace-pre-wrap break-words leading-relaxed">
            {JSON.stringify(pendingToolCall.params, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
