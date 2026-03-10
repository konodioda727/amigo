import type { FC, ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSwipeGesture } from "../../hooks/useSwipeGesture";
import DocSidebar from "../DocSidebar";
import Header from "../Header";
import Sidebar from "../Sidebar";

const TOUCH_EDGE_THRESHOLD = 30;
const SWIPE_THRESHOLD = 50;
const SIDEBAR_WIDTH = 260; // px
const DESKTOP_BREAKPOINT = 768; // md breakpoint in Tailwind

interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within Layout");
  }
  return context;
};

interface LayoutProps {
  children: ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(true);
  const isDesktop = useMediaQuery(`(min-width: ${DESKTOP_BREAKPOINT}px)`);

  useEffect(() => {
    // 监听屏幕尺寸变化，小屏幕默认关闭，大屏幕默认展开
    setIsOpen(isDesktop);
  }, [isDesktop]);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const close = useCallback(() => setIsOpen(false), []);
  const open = useCallback(() => setIsOpen(true), []);

  // 移动端滑动手势支持
  useSwipeGesture({
    onSwipeRight: open,
    onSwipeLeft: close,
    edgeThreshold: TOUCH_EDGE_THRESHOLD,
    swipeThreshold: SWIPE_THRESHOLD,
  });

  // 键盘支持：Escape 关闭侧边栏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        close();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close }}>
      <div className="h-screen flex flex-col overflow-hidden">
        <Header />

        <div className="flex-1 flex overflow-hidden relative">
          {/* 移动端侧边栏遮罩 */}
          {!isDesktop && (
            <div
              className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
                isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
              onClick={close}
              aria-hidden="true"
            />
          )}

          {/* 侧边栏 - 桌面端固定宽度，移动端底部弹出 Drawer */}
          <aside
            className={`
              ${
                isDesktop
                  ? `${
                      isOpen ? "w-auto" : "w-0"
                    } relative h-full bg-neutral-50/80 border-r border-gray-200 transition-[width] duration-300 ease-in-out overflow-hidden shrink-0`
                  : `fixed inset-x-0 bottom-0 z-50 flex flex-col h-[85dvh] bg-neutral-50/85 backdrop-blur-xl border-t border-white/40 rounded-t-3xl shadow-[0_-8px_30px_-5px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-in-out ${
                      isOpen ? "translate-y-0" : "translate-y-full"
                    }`
              }
            `}
            style={isDesktop && isOpen ? { width: `${SIDEBAR_WIDTH}px` } : undefined}
            aria-hidden={!isOpen}
          >
            {/* 移动端拖拽把手 */}
            {!isDesktop && (
              <button
                type="button"
                className="w-full flex justify-center py-3 shrink-0 cursor-pointer touch-none bg-transparent border-none"
                onClick={close}
                aria-label="关闭侧边栏"
              >
                <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
              </button>
            )}
            <div
              className="w-full flex-1 overflow-hidden flex flex-col"
              style={isDesktop ? { maxWidth: `${SIDEBAR_WIDTH}px` } : undefined}
            >
              <Sidebar />
            </div>
          </aside>

          <main className="flex-1 flex flex-col items-center overflow-hidden min-w-0">
            {children}
          </main>

          <DocSidebar />
        </div>
      </div>
    </SidebarContext.Provider>
  );
};

export default Layout;
