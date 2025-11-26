import { StopCircle } from "lucide-react";
import type { InterruptDisplayType } from "@/messages/types";

const InterruptRenderer: React.FC<InterruptDisplayType> = ({ updateTime }) => {
  return (
    <div className="flex justify-center w-full mb-3">
      {/* 系统消息样式 - 居中显示 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-warning/10 rounded-lg text-warning text-xs">
        <StopCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <span>会话已中断</span>
        <span className="opacity-50 ml-1">
          {new Date(updateTime).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};

export default InterruptRenderer;
