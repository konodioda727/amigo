import type React from "react";
import ConversationHistory from "./ConversationHistory";
import NewChatButton from "./NewChatButton";

const Sidebar: React.FC = () => {
  return (
    <aside className="w-[240px] h-full border-r border-gray-100 bg-[#f8f9fb] flex flex-col shrink-0">
      <div className="p-4">
        <NewChatButton />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="text-[12px] font-medium text-gray-400 px-2.5 mb-2">历史对话</div>
        <ConversationHistory />
      </div>
    </aside>
  );
};

export default Sidebar;
