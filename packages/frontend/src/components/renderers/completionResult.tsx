import React from "react";
import { CompletionResultType } from "@/messages/types";

const CompletionResultRenderer: React.FC<CompletionResultType> = ({ result }) => (
  <div className="chat chat-start mb-2">
    <div className="chat-bubble bg-success text-success-content">
      <div className="font-bold">任务完成</div>
      <div className="text-sm whitespace-pre-wrap">{result}</div>
    </div>
  </div>
);

export default CompletionResultRenderer;