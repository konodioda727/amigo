import { NotebookPen } from "lucide-react";
import type React from "react";
import { OpenDesignDocButton } from "./OpenDesignDocButton";
import { ToolAccordion } from "./ToolAccordion";

interface CreateDesignDocToolOutput {
  success?: boolean;
  validationErrors?: string[];
  message?: string;
  startLine?: number;
  endLine?: number;
  title?: string | null;
  updatedAt?: string;
  summary?: {
    pageName?: string;
    width?: number;
    minHeight?: number;
    sectionCount?: number;
  };
  document?: {
    document?: Record<string, unknown>;
    pageId?: string;
    title?: string | null;
  };
}

interface CreateDesignDocRendererProps {
  message: {
    toolName: string;
    params: Record<string, unknown>;
    toolOutput?: CreateDesignDocToolOutput;
    error?: string;
    hasError?: boolean;
    partial?: boolean;
  };
  isLatest: boolean;
}

export const DefaultCreateDesignDocRenderer: React.FC<CreateDesignDocRendererProps> = ({
  message,
}) => {
  const { toolName, params, toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;
  const isEditMode = toolName === "replaceDesignSectionFromMarkup" || Boolean(params?.update);
  const storedDoc =
    toolOutput?.document && typeof toolOutput.document === "object"
      ? toolOutput.document
      : undefined;
  const validationErrors = Array.isArray(toolOutput?.validationErrors)
    ? toolOutput.validationErrors
    : [];
  const validationPassed = toolOutput?.success === true && validationErrors.length === 0;
  const validationFailed = !!toolOutput && !validationPassed;
  const shouldAutoExpand = !isLoading && (hasError || validationFailed);
  const expansionKey = validationFailed ? "failed" : hasError ? "error" : "default";

  return (
    <ToolAccordion
      key={`${toolName}-${params?.pageId || storedDoc?.pageId || "unknown"}-${expansionKey}`}
      icon={<NotebookPen size={14} />}
      title={`${isEditMode ? "修改设计稿" : "创建设计稿"}: ${String(params?.pageId || storedDoc?.pageId || "未命名")}`}
      action={<OpenDesignDocButton pageId={String(params?.pageId || storedDoc?.pageId || "")} />}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
      isExpandedDefault={shouldAutoExpand}
    >
      <div className="space-y-2 text-xs text-neutral-600">
        {!isCompleted ? (
          <div>设计稿处理中</div>
        ) : validationPassed ? (
          <div className="text-emerald-600">Schema 校验通过</div>
        ) : (
          <div className="text-rose-600">Schema 校验未通过</div>
        )}
      </div>
    </ToolAccordion>
  );
};
