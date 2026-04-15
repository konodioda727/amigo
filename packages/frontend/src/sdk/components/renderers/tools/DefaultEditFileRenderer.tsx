import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

type EditFileParamOperation = {
  filePath?: string;
  oldString?: string;
  newString?: string;
};

type EditFileResultOperation = {
  filePath?: string;
  message?: string;
  linesWritten?: number;
  diagnostics?: {
    summary?: string;
    errorCount?: number;
  };
};

const getDiffSections = (beforeText: string, afterText: string) => {
  const beforeLines = beforeText.split("\n");
  const afterLines = afterText.split("\n");

  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    removed: beforeLines.slice(prefix, beforeLines.length - suffix),
    added: afterLines.slice(prefix, afterLines.length - suffix),
    beforeContext: beforeLines.slice(Math.max(0, prefix - 2), prefix),
    afterContext: afterLines.slice(afterLines.length - suffix, afterLines.length).slice(0, 2),
  };
};

const DiffLine: React.FC<{
  prefix: "+" | "-" | " ";
  line: string;
  tone: "add" | "remove" | "context";
}> = ({ prefix, line, tone }) => {
  const toneClass =
    tone === "add"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "remove"
        ? "bg-rose-50 text-rose-800"
        : "bg-neutral-50 text-neutral-500";

  return (
    <div className={`font-mono text-xs whitespace-pre-wrap break-all px-2 py-1 ${toneClass}`}>
      <span className="mr-2 select-none opacity-70">{prefix}</span>
      <span>{line || " "}</span>
    </div>
  );
};

const getPreviewContent = (message: ToolMessageRendererProps<"editFile">["message"]) => {
  const transportPreview =
    message.websocketData && typeof message.websocketData === "object"
      ? (message.websocketData as { beforeContent?: string; afterContent?: string })
      : undefined;
  const beforeFromResult = transportPreview?.beforeContent;
  const afterFromResult = transportPreview?.afterContent;

  if (beforeFromResult !== undefined || afterFromResult !== undefined) {
    return {
      beforeText: beforeFromResult ?? "",
      afterText: afterFromResult ?? "",
      source: "result" as const,
    };
  }

  if (
    typeof message.params.oldString === "string" &&
    typeof message.params.newString === "string"
  ) {
    return {
      beforeText: message.params.oldString,
      afterText: message.params.newString,
      source: "params" as const,
    };
  }

  if (typeof message.params.newString === "string") {
    return {
      beforeText: "",
      afterText: message.params.newString,
      source: "params" as const,
    };
  }

  return {
    beforeText: "",
    afterText: "",
    source: "none" as const,
  };
};

const getBatchParamOperations = (
  message: ToolMessageRendererProps<"editFile">["message"],
): EditFileParamOperation[] =>
  Array.isArray(message.params.edits)
    ? message.params.edits.filter((edit) => !!edit && typeof edit === "object")
    : [];

const getBatchResultOperations = (
  message: ToolMessageRendererProps<"editFile">["message"],
): EditFileResultOperation[] => {
  const output = message.toolOutput;
  if (!output || !Array.isArray(output.edits)) {
    return [];
  }

  return output.edits.filter((edit) => !!edit && typeof edit === "object");
};

const BatchEditResultBody: React.FC<ToolMessageRendererProps<"editFile">> = ({ message }) => {
  const resultEdits = getBatchResultOperations(message);
  const paramEdits = getBatchParamOperations(message);
  const items = resultEdits.length > 0 ? resultEdits : paramEdits;
  const seenItemKeys = new Map<string, number>();

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-neutral-600">本次批量编辑涉及 {items.length} 个文件。</div>
      <div className="overflow-hidden rounded-lg border border-neutral-200">
        {items.map((edit, index) => {
          const filePath =
            typeof edit.filePath === "string" && edit.filePath.trim().length > 0
              ? edit.filePath
              : `文件 ${index + 1}`;
          const messageText =
            "message" in edit && typeof edit.message === "string" && edit.message.trim().length > 0
              ? edit.message
              : "已提交编辑";
          const diagnosticsSummary =
            "diagnostics" in edit &&
            edit.diagnostics &&
            typeof edit.diagnostics.summary === "string" &&
            edit.diagnostics.summary.trim().length > 0
              ? edit.diagnostics.summary
              : "";
          const itemKeyBase = [filePath, messageText, diagnosticsSummary].join("::");
          const duplicateCount = seenItemKeys.get(itemKeyBase) ?? 0;
          seenItemKeys.set(itemKeyBase, duplicateCount + 1);
          const itemKey =
            duplicateCount === 0 ? itemKeyBase : `${itemKeyBase}::duplicate-${duplicateCount}`;

          return (
            <div key={itemKey} className="border-b border-neutral-200 px-3 py-2 last:border-b-0">
              <div className="font-mono text-xs text-neutral-800 break-all">{filePath}</div>
              <div className="mt-1 text-sm text-neutral-600 break-words">{messageText}</div>
              {diagnosticsSummary ? (
                <div className="mt-1 text-xs text-neutral-500 break-words">
                  {diagnosticsSummary}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const EditFileResultBody: React.FC<ToolMessageRendererProps<"editFile">> = ({ message }) => {
  const { beforeText, afterText, source } = getPreviewContent(message);
  const hasDiff = beforeText !== afterText;
  const batchParamEdits = getBatchParamOperations(message);
  const batchResultEdits = getBatchResultOperations(message);

  if (source === "none" && (batchParamEdits.length > 0 || batchResultEdits.length > 0)) {
    return <BatchEditResultBody message={message} isLatest={false} />;
  }

  if (source === "none") {
    return null;
  }

  if (!hasDiff) {
    return <div className="text-sm text-neutral-600">文件已成功编辑，内容未产生可展示的差异。</div>;
  }

  const diff = getDiffSections(beforeText, afterText);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200">
      {diff.beforeContext.map((line) => (
        <DiffLine key={`ctx-before-${line}`} prefix=" " line={line} tone="context" />
      ))}
      {diff.removed.map((line) => (
        <DiffLine key={`removed-${line}`} prefix="-" line={line} tone="remove" />
      ))}
      {diff.added.map((line) => (
        <DiffLine key={`added-${line}`} prefix="+" line={line} tone="add" />
      ))}
      {diff.afterContext.map((line) => (
        <DiffLine key={`ctx-after-${line}`} prefix=" " line={line} tone="context" />
      ))}
    </div>
  );
};

export const DefaultEditFileRenderer: React.FC<ToolMessageRendererProps<"editFile">> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError, partial } = message;
  const hasPreview = getPreviewContent(message).source !== "none";
  const batchEditCount = Array.isArray(params.edits) ? params.edits.length : 0;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;
  const title =
    typeof params.filePath === "string" && params.filePath.trim().length > 0
      ? `编辑文件: ${params.filePath}`
      : batchEditCount > 0
        ? `批量编辑文件: ${batchEditCount} 项`
        : "编辑文件";

  return (
    <ToolAccordion title={title} isLoading={isLoading} hasError={hasError} error={error}>
      {(isCompleted || hasPreview || batchEditCount > 0) && (
        <EditFileResultBody message={message} isLatest={false} />
      )}
    </ToolAccordion>
  );
};
