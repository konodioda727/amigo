import type { InterruptDisplayType } from "@/messages/types";
import { StopCircle } from "lucide-react";

const InterruptRenderer: React.FC<InterruptDisplayType> = ({ updateTime }) => {
  return (
    <div className="chat chat-start mb-4">
      <div className="chat-bubble bg-warning/20 text-warning-content border border-warning/30">
        <div className="flex items-center gap-2">
          <StopCircle className="h-4 w-4" />
          <span className="text-sm">会话已中断</span>
        </div>
        <div className="text-xs opacity-70 mt-1">
          {new Date(updateTime).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default InterruptRenderer;
