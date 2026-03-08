import { FileEdit, FileText, SquareArrowOutUpRight } from "lucide-react";
import type React from "react";
import {
  DefaultToolRenderer,
  type ToolMessageRendererProps,
  useTasks,
  useWebSocketContext,
} from "@/sdk";
import { EditFileResultBody } from "@/sdk/components/renderers/tools/DefaultEditFileRenderer";
import { ReadFileResultBody } from "@/sdk/components/renderers/tools/DefaultReadFileRenderer";
import { ToolAccordion } from "@/sdk/components/renderers/tools/ToolAccordion";
import { getSandboxEditorUrl, getSandboxOpenFileUrl } from "../utils/sandboxEditor";

const OpenEditorIconLink: React.FC<{
  editorUrl: string;
  openFileUrl: string;
  filePath?: string;
}> = ({ editorUrl, openFileUrl, filePath }) =>
  editorUrl ? (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      title="在 Sandbox 编辑器中打开"
      aria-label="在 Sandbox 编辑器中打开"
      onClick={() => {
        const editorWindow = window.open(editorUrl, "amigo-sandbox-editor");
        editorWindow?.focus();

        if (!openFileUrl || !filePath) {
          return;
        }

        void fetch(openFileUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ filePath }),
        });
      }}
    >
      <SquareArrowOutUpRight className="h-3.5 w-3.5" />
    </button>
  ) : (
    <></>
  );

export const SandboxToolRenderer: React.FC<ToolMessageRendererProps<any>> = (props) => {
  const { message } = props;
  const { mainTaskId, currentTaskId } = useTasks();
  const { config } = useWebSocketContext();
  const sandboxId = mainTaskId || currentTaskId;
  const editorUrl = getSandboxEditorUrl(config.url, sandboxId);
  const openFileUrl = getSandboxOpenFileUrl(config.url, sandboxId);
  const isCompleted = !!message.toolOutput;
  const hasEditPreview =
    message.toolName === "editFile" &&
    (typeof message.params?.content === "string" || typeof message.params?.replace === "string");
  const isLoading = message.partial !== undefined ? message.partial : !isCompleted;
  const action =
    !message.partial && typeof message.params?.filePath === "string" ? (
      <OpenEditorIconLink
        editorUrl={editorUrl}
        openFileUrl={openFileUrl}
        filePath={message.params.filePath}
      />
    ) : undefined;

  if (message.toolName === "editFile") {
    return (
      <ToolAccordion
        icon={<FileEdit size={14} />}
        title={`编辑文件: ${message.params.filePath}`}
        action={action}
        isLoading={isLoading}
        hasError={message.hasError}
        error={message.error}
        isExpandedDefault={true}
      >
        {(isCompleted || hasEditPreview) && (
          <EditFileResultBody message={message} isLatest={props.isLatest} />
        )}
      </ToolAccordion>
    );
  }

  if (message.toolName === "readFile") {
    return (
      <ToolAccordion
        icon={<FileText size={14} />}
        title={`读取文件: ${message.params.filePath}`}
        action={action}
        isLoading={isLoading}
        hasError={message.hasError}
        error={message.error}
        isExpandedDefault={true}
      >
        {isCompleted && <ReadFileResultBody message={message} isLatest={props.isLatest} />}
      </ToolAccordion>
    );
  }

  return <DefaultToolRenderer {...props} />;
};
