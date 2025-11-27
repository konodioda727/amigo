import { Plus } from "lucide-react";
import type React from "react";
import { useSidebar } from "./Layout/index";
import { useWebSocketStore } from "@/store/websocket";

const NewChatButton: React.FC = () => {
  const createNewConversation = useWebSocketStore((state) => state.createNewConversation);
  const { isOpen, close } = useSidebar();

  const handleClick = () => {
    createNewConversation();
    close();
  };

  return (
    <button
      onClick={handleClick}
      className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-100 hover:bg-neutral-200 transition-colors"
      type="button"
    >
      <Plus className="w-4 h-4 shrink-0" />
      <span 
        className={`text-sm font-medium whitespace-nowrap transition-opacity duration-150 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ display: isOpen ? 'inline' : 'none' }}
      >
        新建对话
      </span>
    </button>
  );
};

export default NewChatButton;
