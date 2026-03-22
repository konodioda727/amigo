import { Clock3, MessageSquare, Store } from "lucide-react";
import type React from "react";
import { NavLink } from "react-router-dom";
import ConversationHistory from "./ConversationHistory";
import NewChatButton from "./NewChatButton";

const Sidebar: React.FC = () => {
  return (
    <div className="w-full h-full flex flex-col shrink-0">
      <div className="p-4">
        <NewChatButton />
      </div>

      <div className="px-3 pb-3">
        <div className="rounded-2xl border border-gray-200 bg-white/80 p-2 shadow-sm">
          <NavItem to="/" icon={<MessageSquare className="h-4 w-4" />} label="聊天" end />
          <NavItem to="/automations" icon={<Clock3 className="h-4 w-4" />} label="自动化" />
          <NavItem to="/skills" icon={<Store className="h-4 w-4" />} label="技能" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="text-xs font-semibold text-gray-500/80 px-2 mb-3">历史对话</div>
        <ConversationHistory />
      </div>
    </div>
  );
};

const NavItem: React.FC<{
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}> = ({ to, label, icon, end = false }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      `mb-1 flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${
        isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`
    }
  >
    {icon}
    <span>{label}</span>
  </NavLink>
);

export default Sidebar;
