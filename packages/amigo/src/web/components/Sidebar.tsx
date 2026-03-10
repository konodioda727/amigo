import type React from "react";
import ConversationHistory from "./ConversationHistory";
import NewChatButton from "./NewChatButton";

const Sidebar: React.FC = () => {
  return (
    <div className="w-full h-full flex flex-col shrink-0">
      <div className="p-4">
        <NewChatButton />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="text-xs font-semibold text-gray-500/80 px-2 mb-3">历史对话</div>
        <ConversationHistory />
      </div>
    </div>
  );
};

export default Sidebar;
