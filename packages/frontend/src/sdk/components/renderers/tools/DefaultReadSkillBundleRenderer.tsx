import { BookOpenText } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

type ReadSkillBundleMessage = ToolMessageRendererProps<any>["message"] & {
  params?: {
    skillId?: string;
  };
  toolOutput?: {
    skillId?: string;
    skillName?: string;
    filePath?: string;
    message?: string;
    content?: string;
    isBinary?: boolean;
  };
};

export const DefaultReadSkillBundleRenderer: React.FC<ToolMessageRendererProps<any>> = ({
  message,
}) => {
  const { error, hasError, partial } = message;
  const typedMessage = message as ReadSkillBundleMessage;
  const isCompleted = typedMessage.toolOutput !== undefined;
  const isLoading = partial === true;
  const skillLabel =
    typedMessage.toolOutput?.skillName ||
    typedMessage.toolOutput?.skillId ||
    typedMessage.params?.skillId ||
    "未知";

  return (
    <ToolAccordion
      icon={<BookOpenText size={14} />}
      title={`正在查看【${skillLabel}】技能`}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {isCompleted && (
        <div className="space-y-2">
          {typedMessage.toolOutput?.message ? (
            <div className="text-xs text-neutral-500">{typedMessage.toolOutput.message}</div>
          ) : null}
          {typedMessage.toolOutput?.filePath ? (
            <div className="text-xs text-neutral-500">文件: {typedMessage.toolOutput.filePath}</div>
          ) : null}
          {typedMessage.toolOutput?.isBinary ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              这是二进制文件，当前不展示文本内容。
            </div>
          ) : typedMessage.toolOutput?.content ? (
            <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-100">
              <code>{typedMessage.toolOutput.content}</code>
            </pre>
          ) : null}
        </div>
      )}
    </ToolAccordion>
  );
};
