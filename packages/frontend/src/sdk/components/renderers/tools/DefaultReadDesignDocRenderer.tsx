import { NotebookText } from "lucide-react";
import type React from "react";
import { OpenDesignDocButton } from "./OpenDesignDocButton";
import { ToolAccordion } from "./ToolAccordion";

interface ReadDesignDocToolOutput {
  success?: boolean;
  pageId?: string;
  message?: string;
  content?: string;
  summary?: {
    title?: string | null;
    pageName?: string;
    width?: number;
    minHeight?: number;
    sectionCount?: number;
    updatedAt?: string;
  };
  availableDocs?: Array<{
    pageId: string;
    title?: string | null;
    updatedAt?: string | null;
    valid?: boolean;
  }>;
  validationErrors?: string[];
}

interface ReadDesignDocRendererProps {
  message: {
    toolName: string;
    params: Record<string, unknown>;
    toolOutput?: ReadDesignDocToolOutput;
    error?: string;
    hasError?: boolean;
    partial?: boolean;
  };
  isLatest: boolean;
}

export const DefaultReadDesignDocRenderer: React.FC<ReadDesignDocRendererProps> = ({ message }) => {
  const { params, toolOutput, error, hasError, partial } = message;
  const isCompleted = !!toolOutput;
  const isLoading = partial !== undefined ? partial : !isCompleted;
  const pageId =
    typeof toolOutput?.pageId === "string"
      ? toolOutput.pageId
      : typeof params?.pageId === "string"
        ? params.pageId
        : "";
  const validationErrors = Array.isArray(toolOutput?.validationErrors)
    ? toolOutput.validationErrors
    : [];
  const validationPassed = !!toolOutput && validationErrors.length === 0;

  return (
    <ToolAccordion
      icon={<NotebookText size={14} />}
      title={`读取设计稿: ${pageId || "设计稿索引"}`}
      action={<OpenDesignDocButton pageId={pageId} />}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      <div className="space-y-2 text-xs text-neutral-600">
        {!isCompleted ? (
          <div>设计稿读取中</div>
        ) : validationPassed ? (
          <div className="text-emerald-600">Schema 校验通过</div>
        ) : null}
        {isCompleted && !validationPassed ? (
          <div className="text-rose-600">Schema 校验未通过</div>
        ) : null}
      </div>
    </ToolAccordion>
  );
};
