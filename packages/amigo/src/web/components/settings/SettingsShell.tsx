import { Loader2 } from "lucide-react";
import type React from "react";
import type { SettingsPageDefinition } from "./types";

interface SettingsShellProps {
  page: SettingsPageDefinition;
  tabs: SettingsPageDefinition[];
  activeTab: SettingsPageDefinition["id"];
  onTabChange: (tabId: SettingsPageDefinition["id"]) => void;
  sideList: React.ReactNode;
  sideAction?: React.ReactNode;
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}

const SettingsShell: React.FC<SettingsShellProps> = ({
  page,
  tabs,
  activeTab,
  onTabChange,
  sideList,
  sideAction,
  loading,
  saving,
  onClose,
  onSave,
  children,
}) => (
  <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4 py-4 backdrop-blur-sm">
    <div className="flex h-[min(800px,94vh)] w-full max-w-[1240px] overflow-hidden rounded bg-white shadow-2xl overflow-hidden ring-1 ring-slate-900/10">
      <aside className="flex w-[160px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/50">
        <div className="flex h-12 items-center border-b border-slate-200 px-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="px-2 py-2">
          <div className="space-y-0.5">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`flex w-full items-center rounded-sm px-3 py-1.5 text-left text-[13px] transition ${
                    isActive
                      ? "bg-slate-200/60 font-medium text-slate-900 shadow-sm"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <aside className="flex w-[240px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-12 items-center justify-between border-b border-slate-200 px-4 bg-slate-50/30">
          <div className="text-xs font-semibold text-slate-700">{page.sidebarTitle}</div>
          <div>{sideAction}</div>
        </div>

        <div className="min-h-0 flex-1 px-2 py-2">
          <div className="min-h-0 overflow-y-auto h-full">
            {loading ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载中...
              </div>
            ) : (
              sideList
            )}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-slate-50/30">
        <div className="flex h-12 items-center justify-between border-b border-slate-200 px-6 bg-white">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{page.title}</div>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存配置
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载配置...
            </div>
          ) : (
            children
          )}
        </div>
      </section>
    </div>
  </div>
);

export default SettingsShell;
