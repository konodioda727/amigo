import { useNavigate, useParams } from "react-router-dom";
import { ConversationHistory as SDKConversationHistory } from "@/sdk";
import { useSidebar } from "./Layout/index";

/**
 * Demo app wrapper for SDK ConversationHistory component
 * Adds routing navigation and mobile-specific behavior
 */
const ConversationHistory = () => {
  const { close } = useSidebar();
  const navigate = useNavigate();
  const { taskId } = useParams<{ taskId: string }>();

  const handleSelectConversation = (selectedTaskId: string) => {
    console.log(`[ConversationHistory] Selected conversation: ${selectedTaskId}`);

    // Navigate to the conversation route
    navigate(`/${selectedTaskId}`);

    // 移动端选中会话后自动收起侧边栏
    if (window.innerWidth < 768) {
      close();
    }
  };

  return (
    <SDKConversationHistory onSelectConversation={handleSelectConversation} activeTaskId={taskId} />
  );
};

export default ConversationHistory;
