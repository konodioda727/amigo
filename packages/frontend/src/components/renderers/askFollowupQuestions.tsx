import { useWebSocket } from "@/components/WebSocketProvider";
import type { AskFollowupQuestionType } from "@/messages/types";
import { Check, HelpCircle } from "lucide-react";
import { useState } from "react";

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
    <div className="chat chat-start mb-4">
      <div className="chat-bubble bg-base-200 text-base-content">
        <div className="flex items-center gap-2 mb-3">
          <HelpCircle className="h-5 w-5 text-info" />
          <div className="font-semibold text-sm">跟进问题</div>
        </div>
        <div className="mb-3 text-sm leading-relaxed">{question}</div>
        {sugestions && sugestions.length > 0 && (
          <div className="flex flex-col gap-2">
            {sugestions.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                disabled={selectedOption !== null}
                className={`btn btn-sm justify-start text-left h-auto min-h-[2.5rem] py-2 px-4 transition-all ${
                  selectedOption === suggestion
                    ? "btn-primary"
                    : selectedOption !== null
                      ? "btn-disabled opacity-50"
                      : "btn-outline hover:btn-primary"
                }`}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                <span className="font-medium mr-2">{index + 1}.</span>
                <span className="flex-1">{suggestion}</span>
                {selectedOption === suggestion && (
                  <Check className="h-4 w-4 ml-2" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AskFollowupQuestionRenderer;
