import React from "react";
import { useWebSocket } from "./WebSocketProvider";

const ConversationHistory: React.FC = () => {
  const { taskHistories, setTaskId } = useWebSocket();

  const handleHistoryClick = (taskId: string) => {
    setTaskId(taskId)
  };

  if (!taskHistories || taskHistories.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="text-sm opacity-60 mb-1">会话历史</div>
      <ul className="space-y-1">
        {taskHistories.map((history) => (
          <li key={history.taskId}>
            <button
              type="button"
              className="text-sm cursor-pointer hover:text-blue-600 text-left w-full p-0 m-0 border-none bg-transparent underline-offset-2 hover:underline"
              onClick={() => handleHistoryClick(history.taskId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleHistoryClick(history.taskId);
                }
              }}
            >
              {history.title} (ID: {history.taskId})
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ConversationHistory; 