import { Check } from "lucide-react";
import { useState } from "react";
import type { AskFollowupQuestionType } from "@/messages/types";
import { useWebSocket } from "@/components/WebSocketProvider";

const AskFollowupQuestionRenderer: React.FC<AskFollowupQuestionType> = ({
  question,
  sugestions,
  disabled: propsDisabled,
  selectedOption: propsSelectedOption,
}) => {
  const { sendMessage, taskId } = useWebSocket();
  const [localSelectedOption, setLocalSelectedOption] = useState<string | null>(null);
  
  // 优先使用 props 中的 selectedOption（来自历史消息），否则使用本地状态
  const selectedOption = propsSelectedOption ?? localSelectedOption;
  const isDisabledByProps = propsDisabled || propsSelectedOption !== undefined;
  
  const handleSuggestionClick = (suggestion: string) => {
    if (isDisabledByProps) return;
    
    setLocalSelectedOption(suggestion);
    sendMessage({
      type: "userSendMessage",
      data: {
        message: suggestion,
        taskId: taskId || '',
        updateTime: Date.now(),
      },
    });
  };

  return (
    <div className="mb-4">
      <div className="chat chat-start">
        <div className="chat-bubble bg-neutral-100 text-neutral-900 rounded-xl px-4 py-3 shadow-none max-w-[85%] break-words overflow-hidden">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{question}</div>
        </div>
      </div>

      {sugestions && sugestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {sugestions.map((suggestion) => {
            const isSelected = selectedOption === suggestion;
            const isOtherSelected = selectedOption !== null && !isSelected;
            const isClickDisabled = isDisabledByProps || localSelectedOption !== null;
            
            return (
              <button
                key={suggestion}
                type="button"
                disabled={isClickDisabled}
                className={`
                  px-3 py-1.5
                  rounded-full
                  text-sm
                  transition-all duration-200
                  ${
                    isSelected
                      ? "bg-primary text-white"
                      : isOtherSelected || isDisabledByProps
                        ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                        : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }
                `}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                <span className="flex items-center gap-1.5">
                  {suggestion}
                  {isSelected && <Check className="h-3 w-3" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AskFollowupQuestionRenderer;
