import type React from "react";
import { Plus } from "lucide-react";
import { useWebSocket } from "./WebSocketProvider";

const NewChatButton: React.FC = () => {
  const { createNewConversation } = useWebSocket();

  const handleClick = () => {
    createNewConversation();
  };

  return (
    <button
      onClick={handleClick}
      className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border border-dashed transition-colors"
      style={{
        backgroundColor: "var(--color-neutral-100)",
        borderColor: "var(--color-neutral-300)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--color-neutral-200)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--color-neutral-100)";
      }}
      type="button"
    >
      <Plus className="w-4 h-4" />
      <span className="text-sm font-medium">新建对话</span>
    </button>
  );
};

export default NewChatButton;
