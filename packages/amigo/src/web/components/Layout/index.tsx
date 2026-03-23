import type { FC, ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSwipeGesture } from "../../hooks/useSwipeGesture";
import DocSidebar from "../DocSidebar";
import Header from "../Header";
import Sidebar from "../Sidebar";

const TOUCH_EDGE_THRESHOLD = 30;
const SWIPE_THRESHOLD = 50;
const SIDEBAR_WIDTH = 208; // px
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
      <div className="flex h-screen flex-col overflow-hidden">
        <Header />

        <div className="relative flex flex-1 overflow-hidden">
          {!isDesktop && (
            <div
              className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
                isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
              onClick={close}
              aria-hidden="true"
            />
          )}

          <aside
            className={`
              ${
                isDesktop
                  ? `${isOpen ? "w-auto" : "w-0"} relative h-full shrink-0 overflow-hidden border-r border-slate-200 bg-[#f7f7f7] transition-[width] duration-300 ease-in-out`
                  : `fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-hidden border-t border-slate-200 bg-[#f7f7f7] transition-transform duration-300 ease-in-out ${
                      isOpen ? "translate-y-0" : "translate-y-full"
                    }`
              }
            `}
            style={isDesktop && isOpen ? { width: `${SIDEBAR_WIDTH}px` } : undefined}
            aria-hidden={!isOpen}
          >
            {!isDesktop && (
              <button
                type="button"
                className="flex w-full shrink-0 cursor-pointer justify-center border-none bg-transparent py-3 touch-none"
                onClick={close}
                aria-label="关闭侧边栏"
              >
                <div className="h-1.5 w-12 rounded-full bg-gray-300" />
              </button>
            )}
            <div
              className="flex h-full w-full flex-1 flex-col overflow-hidden"
              style={isDesktop ? { maxWidth: `${SIDEBAR_WIDTH}px` } : undefined}
            >
              <Sidebar />
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col items-center overflow-hidden">
            {children}
          </main>

          <DocSidebar />
        </div>
      </div>
    </SidebarContext.Provider>
  );
};

export default Layout;
