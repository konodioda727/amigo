import { SquarePen } from "lucide-react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocketContext } from "@/sdk";
import { useSidebar } from "./Layout/index";

const NewChatButton: React.FC = () => {
  const { store } = useWebSocketContext();
  const createNewConversation = store((state) => state.createNewConversation);
  const { isOpen, close } = useSidebar();
  const navigate = useNavigate();

  const handleClick = () => {
    createNewConversation();
    navigate("/");
    close();
  };

  return (
    <button
      onClick={handleClick}
      className="w-full h-[42px] flex items-center px-3.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all group"
      type="button"
    >
      <div className="flex items-center gap-2.5">
        <SquarePen className="w-4 h-4 shrink-0 text-gray-500 group-hover:text-gray-700 transition-colors" />
        <span
          className={`text-[13px] font-medium text-gray-700 transition-opacity duration-150 ${
            isOpen ? "opacity-100" : "opacity-0"
          }`}
          style={{ display: isOpen ? "inline" : "none" }}
        >
          新对话
        </span>
      </div>
    </button>
  );
};

export default NewChatButton;
