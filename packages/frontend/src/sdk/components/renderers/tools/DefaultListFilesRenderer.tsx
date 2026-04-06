import type { ListFilesResult } from "@amigo-llm/types";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";
import { ToolCodeBlock } from "./ToolCodeBlock";

const asListFilesResult = (value: unknown): Partial<ListFilesResult> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Partial<ListFilesResult>)
    : undefined;

export const DefaultListFilesRenderer: React.FC<ToolMessageRendererProps<"listFiles">> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;
  const result = asListFilesResult(toolOutput);
  const directoryPath =
    typeof result?.directoryPath === "string"
      ? result.directoryPath
      : typeof params.directoryPath === "string"
        ? params.directoryPath
        : ".";
  const tree =
    typeof result?.tree === "string" && result.tree.trim()
      ? result.tree
      : `${directoryPath === "." ? "." : directoryPath}/`;
  const meta: string[] = [];

  if (typeof result?.maxDepth === "number") {
    meta.push(`深度 ${result.maxDepth}`);
  }
  if (typeof result?.maxEntries === "number") {
    meta.push(`最多 ${result.maxEntries} 项`);
  }
  if (result?.includeHidden === true) {
    meta.push("含隐藏文件");
  }
  if (result?.truncated === true) {
    meta.push("结果已截断");
  }

  return (
    <ToolAccordion
      title={`列出目录: ${directoryPath}`}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
      isExpandedDefault
    >
      {(isCompleted || Object.keys(params).length > 0) && (
        <div className="space-y-2 text-sm text-neutral-700">
          {typeof result?.message === "string" && result.message.trim() ? (
            <div className="font-medium text-neutral-900">{result.message}</div>
          ) : null}
          {meta.length > 0 ? (
            <div className="text-xs text-neutral-500">{meta.join(" · ")}</div>
          ) : null}
          <ToolCodeBlock output={tree} />
        </div>
      )}
    </ToolAccordion>
  );
};
