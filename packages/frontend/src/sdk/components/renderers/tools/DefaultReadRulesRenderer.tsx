import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

export const DefaultReadRulesRenderer: React.FC<ToolMessageRendererProps<"readRules">> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;
  const ids = Array.isArray(params.ids) ? params.ids : [];
  const title = ids.length === 1 ? `查看规则: ${ids[0]}` : `查看规则: ${ids.length} 条`;
  const documents = Array.isArray(toolOutput?.documents) ? toolOutput.documents : [];

  return (
    <ToolAccordion title={title} isLoading={isLoading} hasError={hasError} error={error}>
      {isCompleted && (
        <div className="space-y-3">
          <div className="text-xs text-neutral-500">{toolOutput?.message}</div>
          {documents.map((document) => (
            <div key={document.id} className="space-y-2">
              <div className="text-xs font-medium text-neutral-700">
                {document.title || document.id}
              </div>
              {document.summary ? (
                <div className="text-xs text-neutral-500">{document.summary}</div>
              ) : null}
              <div className="text-xs text-neutral-500">{document.message}</div>
              <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-100">
                <code>{document.content || "无正文"}</code>
              </pre>
            </div>
          ))}
        </div>
      )}
    </ToolAccordion>
  );
};
