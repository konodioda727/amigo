import type { DisplayMessageType, FrontendCommonMessageType } from "@/messages/types";
import AskFollowupQuestionRenderer from "./askFollowupQuestions";
import CompletionResultRenderer from "./completionResult";
import MessageRenderer from "./MessageRenderer";
import ToolRenderer from "./toolRenderer";
import UserMessageRenderer from "./UserMessageRenderer";
import InterruptRenderer from "./InterruptRenderer";

// DisplayMessage 渲染器映射
export function renderDisplayMessage(msg: DisplayMessageType) {
  if (!("type" in msg)) return null;
  switch (msg.type) {
    case "userSendMessage":
      return <UserMessageRenderer key={msg.updateTime} {...msg} />;
    case "message":
      return <MessageRenderer key={msg.updateTime} {...(msg as FrontendCommonMessageType)} />;
    case "completionResult":
      return <CompletionResultRenderer key={msg.updateTime} {...msg} />;
    case "tool":
      return <ToolRenderer key={msg.updateTime} {...msg} />;
    case "askFollowupQuestion":
      return <AskFollowupQuestionRenderer key={msg.updateTime} {...msg} />;
    case "interrupt":
      return <InterruptRenderer key={msg.updateTime} {...msg} />;
    default:
      return <div key={Date.now()}>未知消息类型</div>;
  }
}
