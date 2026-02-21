import { MessageCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useTasks, useWebSocketContext } from "@/sdk";
import { useSidebar } from "./Layout/index";

const ConversationHistory = () => {
  const { close } = useSidebar();
  const navigate = useNavigate();
  const { taskId: activeTaskId } = useParams<{ taskId: string }>();
  const { store } = useWebSocketContext();
  const taskHistories = store((state) => state.taskHistories);
  const { mainTaskId } = useTasks();

  const currentTaskId = activeTaskId ?? mainTaskId;

  const handleSelectConversation = (taskId: string) => {
    store.getState().setMainTaskId(taskId);
    navigate(`/${taskId}`);
    if (window.innerWidth < 768) {
      close();
    }
  };

  if (!taskHistories || taskHistories.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      {taskHistories.map((history) => {
        const isActive = history.taskId === currentTaskId;
        return (
          <button
            key={history.taskId}
            type="button"
            onClick={() => handleSelectConversation(history.taskId)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl transition-all text-left group ${
              isActive
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-600 hover:bg-gray-200/30 hover:text-gray-900"
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                isActive ? "bg-blue-50" : "bg-gray-100 group-hover:bg-gray-200"
              }`}
            >
              <MessageCircle size={14} className={isActive ? "text-blue-500" : "text-gray-400"} />
            </div>
            <span className="text-[13px] font-medium truncate flex-1">
              {history.title || "新对话"}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ConversationHistory;
