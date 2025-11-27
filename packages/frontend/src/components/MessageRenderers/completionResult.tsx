import { useState } from "react";
import { CheckCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Streamdown } from "streamdown";
import type { CompletionResultType } from "@/messages/types";

const CompletionResultRenderer: React.FC<CompletionResultType> = ({ result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="flex justify-center w-full mb-3">
      <div className="px-3 py-2 bg-success/10 rounded-lg text-success text-xs w-[80%]">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 w-full text-left cursor-pointer"
        >
          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 font-medium">任务完成</span>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          )}
        </button>
        {isExpanded && (
          <div className="mt-2 pt-2 border-t border-success/20 text-neutral-700 break-words">
            <Streamdown>{result}</Streamdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompletionResultRenderer;
