import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import type { ThinkRendererProps } from "../../types/renderers";
import { prepareStreamdownContent } from "./streamdownContent";

/**
 * Default renderer for think message type
 */
export const DefaultThinkRenderer: React.FC<ThinkRendererProps> = ({ message }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const thinkContent = useMemo(() => prepareStreamdownContent(message.think), [message.think]);

  // Auto-scroll to bottom when collapsed and content updates
  useEffect(() => {
    if (!isExpanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [thinkContent, isExpanded]);

  return (
    <div className="flex flex-col mb-2 px-2 max-w-[85%]">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-600 transition-colors w-fit pb-1"
      >
        <Brain size={14} className={message.partial ? "animate-pulse" : ""} />
        <span>思考过程</span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      <div
        className={`relative transition-all duration-300 ease-in-out border-l-2 border-neutral-200 ml-1.5 pl-4 text-sm text-neutral-500`}
      >
        <div
          ref={contentRef}
          className={`
            ${isExpanded ? "max-h-[min(28rem,60vh)] overflow-y-auto overscroll-contain pr-2" : "max-h-[3rem] overflow-hidden pointer-events-none"}
          `}
          style={{
            maskImage: isExpanded
              ? "none"
              : "linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)",
            WebkitMaskImage: isExpanded
              ? "none"
              : "linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)",
            scrollbarGutter: isExpanded ? "stable" : undefined,
          }}
        >
          <div className="opacity-80">
            <Streamdown mode="static">{thinkContent}</Streamdown>
          </div>
        </div>
      </div>
    </div>
  );
};
