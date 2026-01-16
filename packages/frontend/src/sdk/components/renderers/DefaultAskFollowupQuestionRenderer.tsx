import { Check } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useSendMessage } from "../../hooks/useSendMessage";
import type { AskFollowupQuestionRendererProps } from "../../types/renderers";

/**
 * Default renderer for ask followup question message type
 *
 * Note: This component sends messages to the current main task,
 * not necessarily the task that the message belongs to.
 * This is intentional for the main conversation flow.
 */
export const DefaultAskFollowupQuestionRenderer: React.FC<AskFollowupQuestionRendererProps> = ({
  message,
  isLatest,
}) => {
  const { sendMessage } = useSendMessage();
  const [localSelectedOption, setLocalSelectedOption] = useState<string | null>(null);

  // Determine if disabled - not latest or already has selected option
  const isDisabled = !isLatest || message.disabled || message.selectedOption !== undefined;

  // Use selected option from message or local state
  const selectedOption = message.selectedOption ?? localSelectedOption;

  const handleSuggestionClick = (suggestion: string) => {
    if (isDisabled) return;

    setLocalSelectedOption(suggestion);
    // sendMessage will use mainTaskId from store if no taskId is provided
    sendMessage(suggestion);
  };

  return (
    <div className="mb-4">
      <div className="chat chat-start">
        <div className="chat-bubble bg-neutral-100 text-neutral-900 rounded-xl px-4 py-3 shadow-none max-w-[85%] break-words overflow-hidden">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.question}</div>
        </div>
      </div>

      {message.sugestions && message.sugestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {message.sugestions.map((suggestion) => {
            const isSelected = selectedOption === suggestion;
            const isOtherSelected = selectedOption !== null && !isSelected;
            const isClickDisabled = isDisabled || localSelectedOption !== null;

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
                      : isOtherSelected || isDisabled
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
