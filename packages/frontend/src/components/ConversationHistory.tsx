import { Loader2, MessageCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSendMessage, useWebSocketContext } from "@/sdk";
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

  const handleSelectConversation = (taskId: string) => {
    store.getState().setMainTaskId(taskId);
    navigate(`/${taskId}`);
    if (window.innerWidth < 768) {
      close();
    }
  };

  const handleDelete = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (window.confirm("确定要删除这个对话吗？")) {
      setDeletingTaskId(taskId);

      if (currentTaskId === taskId) {
        navigate("/");
      }

      sendDeleteTask(taskId);
    }
  };

  if (!taskHistories || taskHistories.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      {taskHistories.map((history) => {
        const isActive = history.taskId === currentTaskId;
        const isDeleting = deletingTaskId === history.taskId;
        return (
          <div
            key={history.taskId}
            className={`relative group flex items-center gap-2.5 px-2 py-2 rounded-xl transition-colors ${
              isActive
                ? "bg-white shadow-sm border border-gray-100 text-gray-900"
                : "text-gray-600 hover:bg-gray-200/40 hover:text-gray-900 border border-transparent"
            } ${isDeleting ? "opacity-50" : ""}`}
          >
            <button
              type="button"
              onClick={() => handleSelectConversation(history.taskId)}
              className="flex items-center gap-2.5 flex-1 text-left min-w-0"
              disabled={isDeleting}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  isActive
                    ? "bg-gray-50 border border-gray-100/50"
                    : "bg-transparent group-hover:bg-white"
                }`}
              >
                <MessageCircle size={14} className={isActive ? "text-gray-700" : "text-gray-400"} />
              </div>
              <span className="text-[13px] font-medium truncate flex-1 pr-2">
                {history.title || "新对话"}
              </span>
            </button>

            {/* Delete button - shows on hover */}
            <button
              type="button"
              onClick={(e) => handleDelete(history.taskId, e)}
              className={`p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors transition-opacity shrink-0 ${
                isDeleting ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              aria-label={`删除对话: ${history.title}`}
              title="删除对话"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ConversationHistory;
