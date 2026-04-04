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
  <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/15 px-6 py-6">
    <div className="flex h-[min(820px,92vh)] w-full max-w-[1240px] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <aside className="flex w-[188px] shrink-0 flex-col border-r border-slate-200 bg-[#fafafa]">
        <div className="flex h-14 items-center border-b border-slate-200 px-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition hover:bg-white"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>

        <div className="px-3 py-3">
          <div className="space-y-1">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-[13px] transition ${
                    isActive
                      ? "bg-slate-100 font-medium text-slate-950"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <aside className="flex w-[276px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <div className="text-xs font-medium tracking-[0.08em] text-slate-500 uppercase">
            {page.sidebarTitle}
          </div>
          <div>{sideAction}</div>
        </div>

        <div className="min-h-0 flex-1 px-3 py-3">
          <div className="min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载中...
              </div>
            ) : (
              sideList
            )}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-white">
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-6">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-950">{page.title}</div>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存设置
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载设置...
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
