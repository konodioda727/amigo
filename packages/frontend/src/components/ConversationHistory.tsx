import { useWebSocket } from "./WebSocketProvider";

const ConversationHistory = () => {
  const { taskHistories, setTaskId, taskId: currentTaskId } = useWebSocket();

  const handleHistoryClick = (taskId: string) => {
    console.log(`[ConversationHistory] Clicking history item: ${taskId}, current: ${currentTaskId}`);
    setTaskId(taskId);
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
              {history.title}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default ConversationHistory; 