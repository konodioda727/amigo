import { useWebSocketContext } from "@amigo-llm/frontend";
import { SquarePen } from "lucide-react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { useSidebar } from "./Layout/index";

const NewChatButton: React.FC = () => {
  const { store } = useWebSocketContext();
  const createNewConversation = store((state) => state.createNewConversation);
  const { close } = useSidebar();
  const navigate = useNavigate();

  const handleClick = () => {
    createNewConversation();
    navigate("/");
    close();
  };

  return (
    <button
      onClick={handleClick}
      className="flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-left text-sm font-normal text-slate-600 transition hover:bg-white hover:text-slate-900"
      type="button"
    >
      <SquarePen className="h-4 w-4 shrink-0 text-current" />
      <span>新聊天</span>
    </button>
  );
};

export default NewChatButton;
