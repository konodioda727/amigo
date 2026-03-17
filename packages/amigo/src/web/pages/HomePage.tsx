import { ChatWindow, useTasks } from "@amigo-llm/frontend";
import type React from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppMessageComposer } from "@/components/AppMessageComposer";

const hasTaskNotFoundError = (task: {
  rawMessages: Array<{
    type: string;
    data?: unknown;
  }>;
}): boolean => {
  return task.rawMessages.some(
    (msg) =>
      msg.type === "error" &&
      msg.data &&
      typeof msg.data === "object" &&
      "code" in msg.data &&
      msg.data.code === "TASK_NOT_FOUND",
  );
};

/**
 * Home page component - displays the default chat view
 * Used when no specific taskId is in the URL
 */
const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { mainTaskId, tasks } = useTasks();
  const mainTask = mainTaskId ? tasks[mainTaskId] : undefined;

  // 当 mainTaskId 从空变为有值时，自动导航到对应的任务页面
  useEffect(() => {
    if (mainTaskId && mainTaskId.trim() !== "" && mainTask && !hasTaskNotFoundError(mainTask)) {
      navigate(`/${mainTaskId}`);
    }
  }, [mainTaskId, mainTask, navigate]);

  return (
    <>
      <ChatWindow />
      <AppMessageComposer />
    </>
  );
};

export default HomePage;
