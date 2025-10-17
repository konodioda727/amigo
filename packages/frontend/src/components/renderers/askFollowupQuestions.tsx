import { AskFollowupQuestionType } from "@/messages/types";

const AskFollowupQuestionRenderer: React.FC<AskFollowupQuestionType> = ({
  question,
  sugestions,
}) => (
  <div className="chat chat-start mb-2">
    <div className="chat-bubble">
      <div className="font-bold mb-2">跟进问题</div>
      <div className="mb-2">{question}</div>
      {sugestions && sugestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sugestions.map((suggestion) => (
            <button key={suggestion} type="button" className="btn btn-sm btn-outline">
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  </div>
);

export default AskFollowupQuestionRenderer;