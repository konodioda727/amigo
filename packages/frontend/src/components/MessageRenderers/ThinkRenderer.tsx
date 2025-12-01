import type { ThinkMessageType } from "@/messages/types";
import { Streamdown } from "streamdown";
import { ChevronDown, Brain } from "lucide-react";
import { useExpandedMessagesStore } from "@/store/expandedMessages";

const ThinkRenderer: React.FC<ThinkMessageType> = ({ content, updateTime }) => {
  const messageId = `think-${updateTime}`;
  const isExpanded = useExpandedMessagesStore((state) => state.isExpanded(messageId));
  const toggleExpanded = useExpandedMessagesStore((state) => state.toggleExpanded);

  if (!content) {
    return null;
  }

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => toggleExpanded(messageId)}
        className="flex items-center gap-2 text-sm text-base-content/60 hover:text-base-content/80 transition-colors w-full"
      >
        <Brain className="w-5 h-5" />
        <span className="font-medium">思考过程</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>
      
      {isExpanded && (
        <div className="mt-2 ml-7 pl-4 border-l-2 border-base-300">
          <div className="prose prose-sm max-w-none text-base-content/70">
            <Streamdown>{content}</Streamdown>
          </div>
          {updateTime && (
            <div className="text-xs text-base-content/40 mt-2">
              {new Date(updateTime).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ThinkRenderer;
