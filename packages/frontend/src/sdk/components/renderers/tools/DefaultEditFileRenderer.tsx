import { FileEdit } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

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
  const beforeFromResult = message.toolOutput?.websocketOnly?.beforeContent;
  const afterFromResult = message.toolOutput?.websocketOnly?.afterContent;
  const mode = message.params.mode ?? "overwrite";

  if (beforeFromResult !== undefined || afterFromResult !== undefined) {
    return {
      beforeText: beforeFromResult ?? "",
      afterText: afterFromResult ?? "",
      source: "result" as const,
    };
  }

  if (typeof message.params.content === "string") {
    return {
      beforeText: "",
      afterText: message.params.content,
      source: "params" as const,
    };
  }

  if (mode === "patch" && typeof message.params.replace === "string") {
    return {
      beforeText: "",
      afterText: message.params.replace,
      source: "params" as const,
    };
  }

  return {
    beforeText: "",
    afterText: "",
    source: "none" as const,
  };
};

export const EditFileResultBody: React.FC<ToolMessageRendererProps<"editFile">> = ({ message }) => {
  const { beforeText, afterText, source } = getPreviewContent(message);
  const hasDiff = beforeText !== afterText;

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
  const isCompleted = !!toolOutput;
  const isLoading = partial !== undefined ? partial : !isCompleted;

  return (
    <ToolAccordion
      icon={<FileEdit size={14} />}
      title={`编辑文件: ${params.filePath}`}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {(isCompleted || hasPreview) && <EditFileResultBody message={message} isLatest={false} />}
    </ToolAccordion>
  );
};
