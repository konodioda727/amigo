import type React from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChatWindow, MessageInput, useTasks } from "@/sdk";

/**
 * Home page component - displays the default chat view
 * Used when no specific taskId is in the URL
 */
const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { mainTaskId } = useTasks();

  // 当 mainTaskId 从空变为有值时，自动导航到对应的任务页面
  useEffect(() => {
    if (mainTaskId && mainTaskId.trim() !== "") {
      navigate(`/${mainTaskId}`);
    }
  }, [mainTaskId, navigate]);

  return (
    <>
      <ChatWindow />
      <MessageInput />
    </>
  );
};

export default HomePage;
