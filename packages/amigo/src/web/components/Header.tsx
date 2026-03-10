import { type ConnectionStatus, useConnection, useTasks } from "@amigo-llm/frontend";
import type { SubTaskStatus } from "@amigo-llm/types";
import { Activity, ChevronLeft, Layout, Menu } from "lucide-react";
import { AmigoLogo } from "./AmigoLogo";
import { useSidebar } from "./Layout";

const normalizeSubTaskDescription = (description: string): string =>
  description
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const statusConfig: Record<ConnectionStatus, { label: string; color: string; pulse?: boolean }> = {
  connected: { label: "已连接", color: "bg-green-500" },
  connecting: { label: "连接中...", color: "bg-yellow-500", pulse: true },
  reconnecting: { label: "重连中...", color: "bg-yellow-500", pulse: true },
  disconnected: { label: "已断开", color: "bg-red-500" },
};

const Header: React.FC = () => {
  const { status: connectionStatus } = useConnection();
  const { currentTaskId, mainTaskId, switchTask, taskStatusMaps } = useTasks();
  const { isOpen, toggle } = useSidebar();
  const config = statusConfig[connectionStatus];

  const currentTaskStatusMap: Record<string, SubTaskStatus> | undefined = mainTaskId
    ? taskStatusMaps[mainTaskId]
    : undefined;
  const currentSubTaskDescription =
    currentTaskId && currentTaskId !== mainTaskId && currentTaskStatusMap
      ? (() => {
          const entry = Object.entries(currentTaskStatusMap).find(
            ([, status]) => status.subTaskId === currentTaskId,
          );
          if (!entry) return undefined;
          const [, status] = entry;
          const description = status.description || entry[0];
          return normalizeSubTaskDescription(description);
        })()
      : undefined;
  return (
    <header className="h-12 border-b border-gray-100 bg-white flex items-center justify-between px-4 z-20">
      <div className="flex items-center gap-4 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-all"
            aria-label={isOpen ? "收起侧边栏" : "展开侧边栏"}
          >
            {isOpen ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-1.5">
            <AmigoLogo className="w-8 h-8" />
            <div className="text-sm font-semibold text-gray-800 tracking-tight">Amigo</div>
          </div>
        </div>

        {/* 任务 Tabs */}
        {mainTaskId && (
          <nav className="flex items-center gap-1 ml-4 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => switchTask(mainTaskId)}
              className={`
                flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0
                ${
                  currentTaskId === mainTaskId
                    ? "bg-blue-50 text-blue-600 shadow-sm border border-blue-100"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }
              `}
            >
              <Layout className="w-3 h-3" />
              <span>主任务</span>
            </button>

            {currentSubTaskDescription && (
              <>
                <div className="w-px h-3 bg-gray-200 mx-1" />
                <button
                  className={`
                    flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0
                    bg-blue-50 text-blue-600 shadow-sm border border-blue-100
                  `}
                >
                  <Activity className="w-3 h-3" />
                  <span className="max-w-[150px] truncate">{currentSubTaskDescription}</span>
                </button>
              </>
            )}
          </nav>
        )}
      </div>
      <div className="flex items-center gap-2 px-2 py-0.5">
        <span
          className={`
            w-1.5 h-1.5 rounded-full ${config.color}
            ${config.pulse ? "animate-pulse" : ""}
          `}
        />
        <span className="text-[11px] font-medium text-gray-500">{config.label}</span>
      </div>
    </header>
  );
};

export default Header;
