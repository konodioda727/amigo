import { useWebSocket } from "@/components/WebSocketProvider";
import { AskFollowupQuestionType } from "@/messages/types";

const AskFollowupQuestionRenderer: React.FC<AskFollowupQuestionType> = ({
  question,
  sugestions,
}) => {
  const { sendMessage, taskId } = useWebSocket();
  const handleSuggestionClick = (suggestion: string) => {
    if (!taskId) {
      // Should not happen in this context, but as a fallback.
      console.error("No active taskId to send message");
      return;
    }
    sendMessage({
      type: "userSendMessage",
      data: {
        message: suggestion,
        taskId,
        updateTime: Date.now(),
      },
    });
  };
  return (
    <div className="chat chat-start mb-2">
      <div className="chat-bubble">
        <div className="font-bold mb-2">跟进问题</div>
        <div className="mb-2">{question}</div>
        {sugestions && sugestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sugestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AskFollowupQuestionRenderer;