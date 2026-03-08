import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import type React from "react";
import { useState } from "react";

interface ToolAccordionProps {
  icon: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  isLoading?: boolean;
  hasError?: boolean;
  error?: string;
  isExpandedDefault?: boolean;
  children?: React.ReactNode;
}

export const ToolAccordion: React.FC<ToolAccordionProps> = ({
  icon,
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
      <div className="flex items-start gap-2 py-1 text-error text-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col mb-2 px-2 max-w-[85%]">
      <div className="flex items-center gap-1 pb-1">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex min-w-0 items-center gap-2 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <div className={isLoading ? "animate-pulse" : ""}>{icon}</div>
          <span className="truncate max-w-[200px] text-left">{title}</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {action ? <div className="ml-1 shrink-0">{action}</div> : null}
      </div>

      {isExpanded && children && (
        <div className="transition-all duration-300 ease-in-out border-l-2 border-neutral-200 ml-1.5 pl-4 py-1 text-sm text-neutral-500 flex flex-col gap-2 overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
};
