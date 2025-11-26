import type React from "react";

interface MainContentProps {
  children: React.ReactNode;
}

const MainContent: React.FC<MainContentProps> = ({ children }) => {
  return (
    <main
      className="h-screen flex flex-col ml-[260px] overflow-hidden"
    >
      <div className="flex-1 w-full flex flex-col items-center overflow-hidden">
        {children}
      </div>
    </main>
  );
};

export default MainContent;
