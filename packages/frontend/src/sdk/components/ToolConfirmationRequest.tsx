import { Play, Sparkles, X } from "lucide-react";
import { useMemo } from "react";
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

  const currentTaskId = taskId || mainTaskId;
  const currentTask = currentTaskId ? tasks[currentTaskId] : null;

  const isWaiting = currentTask?.status === "waiting_tool_call";
  const pendingToolCall = currentTask?.pendingToolCall;
  const rawMessages = currentTask?.rawMessages;

  const fallbackToolName = useMemo(() => {
    if (!isWaiting) return null;
    if (pendingToolCall) return null;
    if (!rawMessages || rawMessages.length === 0) return null;

    for (let index = rawMessages.length - 1; index >= 0; index--) {
      const message = rawMessages[index];
      if (message.type !== "tool") continue;

      try {
        const parsed = JSON.parse((message.data as { message?: string }).message || "{}") as {
          toolName?: string;
        };
        if (parsed.toolName) {
          return parsed.toolName;
        }
      } catch {
        // ignore malformed tool payloads
      }
    }

    return null;
  }, [isWaiting, pendingToolCall, rawMessages]);

  if (!isWaiting || !currentTaskId) {
    return null;
  }

  const displayToolName = pendingToolCall?.toolName || fallbackToolName;
  if (!displayToolName) return null;

  const displayToolLabel = getFriendlyToolLabel(displayToolName);

  return (
    <div className={`tool-confirmation-request mb-3 ${className}`}>
      <div className="rounded-2xl border border-sky-200 bg-[linear-gradient(135deg,#f8fdff_0%,#eef7ff_55%,#fef8ef_100%)] px-4 py-4 shadow-[0_10px_30px_rgba(148,163,184,0.12)]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-sky-600 shadow-sm ring-1 ring-sky-100">
            <Sparkles size={18} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-500">
              需要你的确认
            </div>
            <div className="mt-1 text-sm font-medium leading-6 text-slate-800">
              现在要继续执行
              <span className="mx-1 rounded-full bg-white/80 px-2 py-0.5 font-semibold text-slate-900 ring-1 ring-slate-200">
                {displayToolLabel}
              </span>
              吗？
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              我会在你确认后继续；如果先不执行，这一步会被跳过。
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => sendReject(currentTaskId)}
            className="flex-1 rounded-xl border border-slate-200 bg-white/85 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-white"
          >
            <span className="inline-flex items-center gap-1.5">
              <X size={15} />
              先不要
            </span>
          </button>
          <button
            onClick={() => sendConfirm(currentTaskId)}
            className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-[0.99]"
          >
            <span className="inline-flex items-center gap-1.5">
              <Play size={14} fill="currentColor" />
              确认继续
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

const getFriendlyToolLabel = (toolName: string): string => {
  const labels: Record<string, string> = {
    bash: "运行命令",
    browserSearch: "联网搜索",
    completeTask: "提交任务完成结果",
    createTaskDocs: "写入任务文档",
    editFile: "修改文件",
    executeTaskList: "执行任务清单",
    readFile: "读取文件",
    readSkillBundle: "查看技能",
    readTaskDocs: "读取任务文档",
    upsertAutomation: "创建自动化",
  };

  return labels[toolName] || toolName;
};
