import { useSendMessage, useWebSocketContext } from "@amigo-llm/frontend";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSidebar } from "./Layout/index";

const ConversationHistory = () => {
  const { close } = useSidebar();
  const navigate = useNavigate();
  const { taskId: activeTaskId } = useParams<{ taskId: string }>();
  const { store } = useWebSocketContext();
  const taskHistories = store((state) => state.taskHistories);
  const mainTaskId = store((state) => state.mainTaskId);
  const { sendDeleteTask } = useSendMessage();
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const currentTaskId = activeTaskId ?? mainTaskId;
  const histories = taskHistories || [];

  const handleSelectConversation = (taskId: string) => {
    store.getState().setMainTaskId(taskId);
    navigate(`/${taskId}`);
    if (window.innerWidth < 768) {
      close();
    }
  };

  const handleDelete = (taskId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (!window.confirm("确定要删除这个对话吗？")) {
      return;
    }

    setDeletingTaskId(taskId);
    if (currentTaskId === taskId) {
      navigate("/");
    }
    sendDeleteTask(taskId);
  };

  return (
    <div className="space-y-1.5">
      <div className="px-2.5 pb-0.5 text-[13px] font-medium text-slate-400">你的聊天</div>

      <div className="space-y-1">
        {histories.map((history) => {
          const isActive = history.taskId === currentTaskId;
          const isDeleting = deletingTaskId === history.taskId;

          return (
            <div
              key={history.taskId}
              className={`group flex min-h-8 items-center px-2.5 py-1 transition ${
                isActive
                  ? "rounded-sm bg-white text-slate-900"
                  : "rounded-sm text-slate-600 hover:bg-white hover:text-slate-900"
              } ${isDeleting ? "opacity-50" : ""}`}
            >
              <button
                type="button"
                onClick={() => handleSelectConversation(history.taskId)}
                className="min-w-0 flex-1 pr-1 text-left"
                disabled={isDeleting}
              >
                <span className="block truncate text-sm">{history.title || "新对话"}</span>
              </button>

              <button
                type="button"
                onClick={(event) => handleDelete(history.taskId, event)}
                className={`ml-1 shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600 ${
                  isDeleting ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                disabled={isDeleting}
                title="删除对话"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {histories.length === 0 ? (
        <div className="px-2.5 py-3 text-sm text-slate-400">还没有聊天记录</div>
      ) : null}
    </div>
  );
};

export default ConversationHistory;
