import { ChevronLeft, Menu } from "lucide-react";
import { useConnection } from "@/sdk";
import type { ConnectionStatus } from "@/sdk/types/store";
import { useSidebar } from "./Layout";

const statusConfig: Record<ConnectionStatus, { label: string; color: string; pulse?: boolean }> = {
  connected: { label: "已连接", color: "bg-green-500" },
  connecting: { label: "连接中...", color: "bg-yellow-500", pulse: true },
  reconnecting: { label: "重连中...", color: "bg-yellow-500", pulse: true },
  disconnected: { label: "已断开", color: "bg-red-500" },
};

const Header: React.FC = () => {
  const { status: connectionStatus } = useConnection();
  const { isOpen, toggle } = useSidebar();
  const config = statusConfig[connectionStatus];

  return (
    <header className="h-16 border-b border-neutral-200 bg-white flex items-center justify-between px-4 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="p-2 rounded-xl hover:bg-neutral-100 transition-colors"
          aria-label={isOpen ? "收起侧边栏" : "展开侧边栏"}
        >
          {isOpen ? (
            <ChevronLeft className="w-5 h-5 text-neutral-600" />
          ) : (
            <Menu className="w-5 h-5 text-neutral-600" />
          )}
        </button>
        <div className="text-base font-semibold text-neutral-800">Amigo</div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`
            w-2 h-2 rounded-full ${config.color}
            ${config.pulse ? "animate-pulse" : ""}
          `}
        />
        <span className="text-xs text-neutral-500">{config.label}</span>
      </div>
    </header>
  );
};

export default Header;
