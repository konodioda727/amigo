import type React from "react";
import { ToolAccordion } from "./ToolAccordion";

interface ListDesignDocsToolOutput {
  success?: boolean;
  message?: string;
  availableDocs?: Array<{
    pageId: string;
    title?: string | null;
    updatedAt?: string | null;
    valid?: boolean;
  }>;
}

interface ListDesignDocsRendererProps {
  message: {
    toolName: string;
    params: Record<string, unknown>;
    toolOutput?: ListDesignDocsToolOutput;
    error?: string;
    hasError?: boolean;
    partial?: boolean;
  };
}

export const DefaultListDesignDocsRenderer: React.FC<ListDesignDocsRendererProps> = ({
  message,
}) => {
  const { toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;
  const docs = Array.isArray(toolOutput?.availableDocs) ? toolOutput.availableDocs : [];

  return (
    <ToolAccordion
      title={`设计稿列表${docs.length > 0 ? ` (${docs.length})` : ""}`}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      <div className="space-y-2 text-xs text-neutral-600">
        {!isCompleted ? <div>设计稿列表读取中</div> : null}
        {isCompleted && docs.length === 0 ? <div>当前任务还没有设计稿</div> : null}
        {docs.map((doc) => (
          <div key={doc.pageId} className="rounded border border-neutral-200 bg-white px-2 py-1.5">
            <div className="font-medium text-neutral-800">{doc.title || doc.pageId}</div>
            <div className="text-neutral-500">pageId: {doc.pageId}</div>
          </div>
        ))}
      </div>
    </ToolAccordion>
  );
};
