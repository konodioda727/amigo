import { AlertCircle } from "lucide-react";
import type React from "react";
import { Streamdown } from "streamdown";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { COMPLETE_TASK_PHASE_TITLES } from "../../taskTimeline";
import { prepareStreamdownContent } from "../streamdownContent";
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
  const resultContent = prepareStreamdownContent(result);

  if (!hasPreview) {
    return <div className="text-sm text-neutral-600">任务已被标记为完成。</div>;
  }

  return (
    <div className="space-y-2">
      {summary && <div className="text-sm font-medium text-neutral-800">{summary}</div>}
      {result && (
        <div className="prose prose-sm max-w-none prose-p:my-2 prose-pre:my-2">
          <Streamdown>{resultContent}</Streamdown>
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

const getCompleteTaskTitle = (message: ToolMessageRendererProps<"completeTask">["message"]) => {
  const phaseTitle = message.workflowPhase
    ? COMPLETE_TASK_PHASE_TITLES[message.workflowPhase]
    : null;

  if (message.partial === true) {
    return phaseTitle ? `正在完成${phaseTitle}` : "正在完成任务";
  }

  if (message.workflowPhase === "complete") {
    return "最终交付";
  }

  return phaseTitle ? `${phaseTitle}已完成` : "完成任务";
};

export const CompleteTaskTextNode: React.FC<ToolMessageRendererProps<"completeTask">> = ({
  message,
}) => {
  if (message.hasError && message.error) {
    return (
      <div className="inline-flex max-w-[85%] items-start gap-2 px-2 py-1 text-sm text-error">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>{message.error}</span>
      </div>
    );
  }

  return (
    <div className="group -mb-5 max-w-[85%] text-neutral-900">
      <div className="break-words overflow-hidden px-1">
        <CompleteTaskResultBody message={message} isLatest={false} />
      </div>
    </div>
  );
};

export const DefaultCompleteTaskRenderer: React.FC<ToolMessageRendererProps<"completeTask">> = ({
  message,
}) => {
  const { toolOutput, error, hasError, partial } = message;
  const hasPreview = getPreviewContent(message).hasPreview;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;

  if (message.workflowPhase === "complete") {
    return <CompleteTaskTextNode message={message} isLatest={false} />;
  }

  return (
    <ToolAccordion
      title={getCompleteTaskTitle(message)}
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
