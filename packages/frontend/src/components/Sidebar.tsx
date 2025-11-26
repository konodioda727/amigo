import type React from "react";
import NewChatButton from "./NewChatButton";
import ConversationHistory from "./ConversationHistory";

const Sidebar: React.FC = () => {
  return (
    <aside
      className="fixed left-0 top-0 h-screen w-[260px] border-r flex flex-col"
      style={{
        backgroundColor: "var(--color-neutral-50)",
        borderColor: "var(--color-neutral-200)",
        padding: "var(--spacing-4)",
      }}
    >
      <div className="mb-4">
        <NewChatButton />
      </div>
      <div className="flex-1 overflow-y-auto">
        <ConversationHistory />
      </div>
    </aside>
  );
};

export default Sidebar;
