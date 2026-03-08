import { CheckCircle2 } from "lucide-react";
import type React from "react";
import { Streamdown } from "streamdown";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

const getPreviewContent = (message: ToolMessageRendererProps<"completeTask">["message"]) => {
  const summary = typeof message.params?.summary === "string" ? message.params.summary : "";
  const result = typeof message.params?.result === "string" ? message.params.result : "";
  const achievements =
    typeof message.params?.achievements === "string" ? message.params.achievements : "";
  const usage = typeof message.params?.usage === "string" ? message.params.usage : "";

  return {
    summary,
    result,
    achievements,
    usage,
    hasPreview: Boolean(summary || result || achievements || usage),
  };
};

export const CompleteTaskResultBody: React.FC<ToolMessageRendererProps<"completeTask">> = ({
  message,
}) => {
  const { summary, result, achievements, usage, hasPreview } = getPreviewContent(message);

  if (!hasPreview) {
    return <div className="text-sm text-neutral-600">任务已被标记为完成。</div>;
  }

  return (
    <div className="space-y-2">
      {summary && <div className="text-sm font-medium text-neutral-800">{summary}</div>}
      {result && (
        <div className="prose prose-sm max-w-none prose-p:my-2 prose-pre:my-2">
          <Streamdown>{result}</Streamdown>
        </div>
      )}
      {achievements && (
        <div className="text-xs leading-5 text-neutral-600">
          <span className="mr-1 font-semibold text-neutral-700">成果:</span>
          <span>{achievements}</span>
        </div>
      )}
      {usage && (
        <div className="text-xs leading-5 text-neutral-600">
          <span className="mr-1 font-semibold text-neutral-700">使用方式:</span>
          <span>{usage}</span>
        </div>
      )}
    </div>
  );
};

export const DefaultCompleteTaskRenderer: React.FC<ToolMessageRendererProps<"completeTask">> = ({
  message,
}) => {
  const { toolOutput, error, hasError, partial } = message;
  const hasPreview = getPreviewContent(message).hasPreview;
  const isCompleted = !!toolOutput;
  const isLoading = partial !== undefined ? partial : !isCompleted;

  return (
    <ToolAccordion
      icon={<CheckCircle2 size={14} />}
      title="完成任务"
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {(isCompleted || hasPreview) && (
        <div className="text-sm">
          <CompleteTaskResultBody message={message} isLatest={false} />
        </div>
      )}
    </ToolAccordion>
  );
};
