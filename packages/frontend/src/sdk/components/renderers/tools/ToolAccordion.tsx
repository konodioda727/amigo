import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import type React from "react";
import { useState } from "react";

interface ToolAccordionProps {
  title: React.ReactNode;
  action?: React.ReactNode;
  isLoading?: boolean;
  hasError?: boolean;
  error?: string;
  isExpandedDefault?: boolean;
  children?: React.ReactNode;
}

export const ToolAccordion: React.FC<ToolAccordionProps> = ({
  title,
  action,
  isLoading,
  hasError,
  error,
  isExpandedDefault = false,
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(isExpandedDefault);

  if (hasError && error) {
    return (
      <div className="inline-flex max-w-[85%] items-start gap-2 px-2 py-1 text-sm text-error">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="inline-flex max-w-[85%] flex-col px-1 align-top">
      <div className="flex max-w-full items-center gap-1 pb-1">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex min-w-0 max-w-full items-center gap-2 text-left text-xs text-neutral-500 transition-colors hover:text-neutral-700"
        >
          <span className="block min-w-0 max-w-full whitespace-normal break-words leading-5">
            <span className={isLoading ? "loading-shimmer" : ""}>{title}</span>
          </span>
          <span className="shrink-0">
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
        {action ? <div className="ml-1 shrink-0">{action}</div> : null}
      </div>

      {isExpanded && children && (
        <div className="ml-1.5 flex max-h-[min(28rem,60vh)] flex-col gap-2 overflow-y-auto overscroll-contain border-l-2 border-neutral-200 py-1 pl-4 pr-2 text-sm text-neutral-600 transition-all duration-300 ease-in-out">
          {children}
        </div>
      )}
    </div>
  );
};
