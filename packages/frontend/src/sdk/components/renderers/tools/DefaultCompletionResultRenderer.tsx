import type React from "react";
import { Streamdown } from "streamdown";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { prepareStreamdownContent } from "../streamdownContent";
import { ToolAccordion } from "./ToolAccordion";

const getPreviewContent = (message: ToolMessageRendererProps<"completionResult">["message"]) => {
  const summary = typeof message.params?.summary === "string" ? message.params.summary : "";
  const result = typeof message.params?.result === "string" ? message.params.result : "";

  return {
    summary,
    result,
    hasPreview: Boolean(summary || result),
  };
};

export const CompletionResultBody: React.FC<ToolMessageRendererProps<"completionResult">> = ({
  message,
}) => {
  const { summary, result, hasPreview } = getPreviewContent(message);
  const resultContent = prepareStreamdownContent(result);

  if (!hasPreview) {
    return <div className="text-sm text-neutral-600">本轮结果已总结。</div>;
  }

  return (
    <div className="space-y-2">
      {summary && <div className="text-sm font-medium text-neutral-800">{summary}</div>}
      {result && (
        <div className="prose prose-sm max-w-none prose-p:my-2 prose-pre:my-2">
          <Streamdown>{resultContent}</Streamdown>
        </div>
      )}
    </div>
  );
};

export const DefaultCompletionResultRenderer: React.FC<
  ToolMessageRendererProps<"completionResult">
> = ({ message }) => {
  const { toolOutput, error, hasError, partial } = message;
  const hasPreview = getPreviewContent(message).hasPreview;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;

  return (
    <ToolAccordion title="本轮结果" isLoading={isLoading} hasError={hasError} error={error}>
      {(isCompleted || hasPreview) && (
        <div className="text-sm">
          <CompletionResultBody message={message} isLatest={false} />
        </div>
      )}
    </ToolAccordion>
  );
};
