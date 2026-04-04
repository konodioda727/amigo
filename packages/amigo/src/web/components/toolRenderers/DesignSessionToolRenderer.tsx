import { ToolAccordion, type ToolMessageRendererProps } from "@amigo-llm/frontend";
import type { ToolNames } from "@amigo-llm/types";
import type React from "react";
import { useMemo } from "react";

interface DesignSession {
  exists: boolean;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const _readStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const parseDesignSession = (
  toolOutput: unknown,
): { summary: string; session: DesignSession | null } => {
  const output = asRecord(toolOutput);
  const sessionRow = asRecord(output?.session);
  if (!output || !sessionRow) {
    return {
      summary: typeof output?.message === "string" ? output.message : "设计会话处理中",
      session: null,
    };
  }

  const modules = Array.isArray(sessionRow.modules) ? sessionRow.modules.filter(Boolean) : [];

  return {
    summary: typeof output.message === "string" ? output.message : "设计会话",
    session: {
      exists: modules.length >= 0,
    },
  };
};

export const DesignSessionToolRenderer: React.FC<ToolMessageRendererProps<ToolNames>> = ({
  message,
}) => {
  const { summary, session } = useMemo(
    () => parseDesignSession(message.toolOutput),
    [message.toolOutput],
  );

  if (message.hasError && message.error) {
    return <div className="mb-4 max-w-[95%] px-1 text-sm text-red-600">{message.error}</div>;
  }

  if (!session) {
    return <ToolAccordion title={summary} isExpandedDefault isLoading={message.partial} />;
  }

  return (
    <ToolAccordion title={summary} isExpandedDefault isLoading={message.partial}>
      <div className="text-sm text-neutral-700">{summary}</div>
    </ToolAccordion>
  );
};
