import { type ConnectionStatus, useConnection } from "@amigo-llm/frontend";
import { ChevronLeft, Menu } from "lucide-react";
import { AmigoLogo } from "./AmigoLogo";
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
    <header className="z-20 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-xl">
      <div className="flex flex-1 items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="rounded-xl p-2 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-900"
            aria-label={isOpen ? "收起侧边栏" : "展开侧边栏"}
          >
            {isOpen ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-1.5">
            <AmigoLogo className="w-8 h-8" />
            <div className="text-sm font-semibold text-gray-800 tracking-tight">Amigo</div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
        <span
          className={`
            w-1.5 h-1.5 rounded-full ${config.color}
            ${config.pulse ? "animate-pulse" : ""}
          `}
        />
        <span className="text-[11px] font-medium text-slate-500">{config.label}</span>
      </div>
    </header>
  );
};

export default Header;
