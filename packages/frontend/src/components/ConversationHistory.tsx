import { useSidebar } from "./Layout/index";
import { useWebSocketStore } from "@/store/websocket";

/**
 * 格式化时间显示
 */
const formatTime = (dateStr: string | undefined) => {
  if (!dateStr) return "";
  
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) {
    return "昨天";
  }
  if (diffDays < 7) {
    return `${diffDays}天前`;
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
};

const ConversationHistory = () => {
  const taskHistories = useWebSocketStore((state) => state.taskHistories);
  const currentTaskId = useWebSocketStore((state) => state.mainTaskId);
  const setTaskId = useWebSocketStore((state) => state.setMainTaskId);
  const { close } = useSidebar();

  const handleHistoryClick = (taskId: string) => {
    console.log(`[ConversationHistory] Clicking history item: ${taskId}, current: ${currentTaskId}`);
    setTaskId(taskId);
    
    // 移动端选中会话后自动收起侧边栏
    if (window.innerWidth < 768) {
      close();
    }
  };

  if (!taskHistories || taskHistories.length === 0) return null;

  return (
    <ul className="space-y-1">
      {taskHistories.map((history) => {
        const isActive = history.taskId === currentTaskId;
        
        return (
          <li key={history.taskId}>
            <button
              type="button"
              className={`
                w-full text-left
                px-3 py-2.5
                rounded-lg
                text-sm
                transition-colors duration-150
                ${isActive 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-neutral-700 hover:bg-neutral-100'
                }
              `}
              onClick={() => handleHistoryClick(history.taskId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleHistoryClick(history.taskId);
                }
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate flex-1">{history.title}</span>
                <span className="text-xs text-neutral-400 shrink-0">
                  {formatTime(history.updatedAt)}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default ConversationHistory; 