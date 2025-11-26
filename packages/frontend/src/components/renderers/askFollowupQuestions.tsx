import { Check } from "lucide-react";
import { useState } from "react";
import type { AskFollowupQuestionType } from "@/messages/types";
import { useWebSocket } from "@/components/WebSocketProvider";

const AskFollowupQuestionRenderer: React.FC<AskFollowupQuestionType> = ({
  question,
  sugestions,
}) => {
  const { sendMessage, taskId } = useWebSocket();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  
  const handleSuggestionClick = (suggestion: string) => {
    // 标记已选择的选项
    setSelectedOption(suggestion);

    // 直接使用 sendMessage，WebSocketProvider 会自动处理 taskId
    sendMessage({
      type: "userSendMessage",
      data: {
        message: suggestion,
        taskId: taskId || '', // taskId 会被 WebSocketProvider 自动注入
        updateTime: Date.now(),
      },
    });
  };

  return (
    <div className="mb-4 max-w-[80%]">
      {/* 问题作为普通的系统消息 */}
      <div className="chat chat-start">
        <div className="chat-bubble bg-neutral-100 text-neutral-900 rounded-xl px-4 py-3">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{question}</div>
        </div>
      </div>

      {/* 建议选项 - 简洁的气泡样式 */}
      {sugestions && sugestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {sugestions.map((suggestion) => {
            const isSelected = selectedOption === suggestion;
            const isDisabled = selectedOption !== null && !isSelected;
            
            return (
              <button
                key={suggestion}
                type="button"
                disabled={selectedOption !== null}
                className={`
                  px-3 py-1.5
                  rounded-full
                  text-sm
                  transition-all duration-200
                  ${
                    isSelected
                      ? "bg-primary text-white"
                      : isDisabled
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
