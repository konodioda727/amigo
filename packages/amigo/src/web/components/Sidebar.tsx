import { Clock3, LogOut, Settings, Store } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { authClient } from "../auth/client";
import { subscribeOpenSettingsModal } from "../utils/settingsModal";
import ConversationHistory from "./ConversationHistory";
import NewChatButton from "./NewChatButton";
import SettingsModal from "./SettingsModal";

const Sidebar: React.FC = () => {
  const { data: session } = authClient.useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => subscribeOpenSettingsModal(() => setSettingsOpen(true)), []);

  const displayName = session?.user?.name || session?.user?.email || "Amigo User";
  const secondaryText = session?.user?.email || "账户";
  const avatarText = displayName.trim().slice(0, 2).toUpperCase();

  return (
    <>
      <div className="flex h-full min-h-0 w-full shrink-0 flex-col bg-[#f7f7f7]">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-2 pb-0.5 pt-2">
            <div className="space-y-0.5">
              <NewChatButton />
              <NavItem to="/automations" icon={<Clock3 className="h-4 w-4" />} label="自动化" />
              <NavItem to="/skills" icon={<Store className="h-4 w-4" />} label="技能" />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2.5">
            <ConversationHistory />
          </div>
        </div>

        <div className="shrink-0 px-2 pb-2 pt-1">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-slate-600 transition hover:bg-white hover:text-slate-900"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ef5a47] text-xs font-semibold text-white">
                {avatarText}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold leading-5 text-slate-900">
                  {displayName}
                </div>
                <div className="truncate text-xs leading-5 text-slate-400">{secondaryText}</div>
              </div>
            </button>

            {menuOpen ? (
              <div className="absolute bottom-[calc(100%+10px)] left-0 right-0 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                <MenuAction
                  icon={<Settings className="h-4 w-4" />}
                  label="设置"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                />
                <MenuAction
                  icon={<LogOut className="h-4 w-4" />}
                  label="退出登录"
                  onClick={async () => {
                    await authClient.signOut();
                    window.location.assign("/login");
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
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
      `flex h-9 items-center gap-2 rounded-sm px-2.5 text-sm font-normal transition ${
        isActive ? "bg-white text-slate-900" : "text-slate-600 hover:bg-white hover:text-slate-900"
      }`
    }
  >
    <span className="text-current">{icon}</span>
    <span>{label}</span>
  </NavLink>
);

const MenuAction: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
}> = ({ icon, label, onClick }) => (
  <button
    type="button"
    onClick={() => void onClick()}
    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
  >
    <span className="text-slate-500">{icon}</span>
    <span>{label}</span>
  </button>
);

export default Sidebar;
