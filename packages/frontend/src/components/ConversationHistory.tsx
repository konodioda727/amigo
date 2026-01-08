import { ConversationHistory as SDKConversationHistory } from "@/sdk";
import { useSidebar } from "./Layout/index";

/**
 * Demo app wrapper for SDK ConversationHistory component
 * Adds mobile-specific behavior (auto-close sidebar on selection)
 */
const ConversationHistory = () => {
  const { close } = useSidebar();

  const handleSelectConversation = (taskId: string) => {
    console.log(`[ConversationHistory] Selected conversation: ${taskId}`);

    // 移动端选中会话后自动收起侧边栏
    if (window.innerWidth < 768) {
      close();
    }
  };

  return <SDKConversationHistory onSelectConversation={handleSelectConversation} />;
};

export default ConversationHistory;
