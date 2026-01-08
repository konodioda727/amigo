import type React from "react";
import ConversationHistory from "./ConversationHistory";
import NewChatButton from "./NewChatButton";

const Sidebar: React.FC = () => {
  return (
    <aside className="w-full h-full border-r border-neutral-200 bg-neutral-50 flex flex-col shrink-0">
      {/* 顶部操作栏 */}
      <div className="p-3 border-b border-neutral-200">
        <NewChatButton />
      </div>

      {/* 历史记录列表 */}
      <div className="flex-1 overflow-y-auto p-3">
        <ConversationHistory />
      </div>
    </aside>
  );
};

export default Sidebar;
