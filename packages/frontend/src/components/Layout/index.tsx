import type { FC, ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSwipeGesture } from "../../hooks/useSwipeGesture";
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
          {/* 侧边栏 - 桌面端固定宽度，移动端水平铺满 */}
          <aside
            className={`
              ${isOpen ? "w-full md:w-auto" : "w-0"}
              ${isOpen ? "absolute md:relative left-0 top-0 h-full z-50 md:z-auto" : ""}
              transition-all duration-300 ease-in-out
              overflow-hidden shrink-0
            `}
            style={isOpen && isDesktop ? { width: `${SIDEBAR_WIDTH}px` } : undefined}
            aria-hidden={!isOpen}
          >
            <div
              className="w-full h-full md:max-w-none"
              style={isDesktop ? { maxWidth: `${SIDEBAR_WIDTH}px` } : undefined}
            >
              <Sidebar />
            </div>
          </aside>

          <main className="flex-1 flex flex-col items-center overflow-hidden min-w-0">
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
};

export default Layout;
