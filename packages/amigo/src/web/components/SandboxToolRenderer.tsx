import {
  DefaultListFilesRenderer,
  DefaultToolRenderer,
  EditFileResultBody,
  ReadFileResultBody,
  ToolAccordion,
  type ToolMessageRendererProps,
  useTasks,
  useWebSocketContext,
} from "@amigo-llm/frontend";
import type { ToolNames } from "@amigo-llm/types";
import { SquareArrowOutUpRight } from "lucide-react";
import type React from "react";
import {
  getSandboxEditorUrl,
  getSandboxOpenFileUrl,
  getSandboxPreviewUrl,
} from "../utils/sandboxEditor";
import { DesignDraftToolRenderer } from "./toolRenderers/DesignDraftToolRenderer";
import { DesignSessionToolRenderer } from "./toolRenderers/DesignSessionToolRenderer";
import { LayoutOptionsToolRenderer } from "./toolRenderers/LayoutOptionsToolRenderer";
import { ModuleDraftToolRenderer } from "./toolRenderers/ModuleDraftToolRenderer";
import { ThemeOptionsToolRenderer } from "./toolRenderers/ThemeOptionsToolRenderer";

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

const statusFirstToolNames = new Set(["listFiles", "runTest", "updateDevServer"]);

const readBusinessToolError = (toolName: string, toolOutput: unknown): string | undefined => {
  const output = asRecord(toolOutput);
  if (!output || output.success !== false) {
    return undefined;
  }

  const validationErrors = readStringArray(output.validationErrors);
  if (validationErrors.length > 0) {
    return validationErrors[0];
  }

  if (statusFirstToolNames.has(toolName)) {
    return undefined;
  }

  if (typeof output.message === "string" && output.message.trim()) {
    return output.message.trim();
  }

  return "工具执行失败";
};

const OpenExternalIconLink: React.FC<{
  url: string;
  title: string;
  windowName: string;
  onOpen?: () => void;
}> = ({ url, title, windowName, onOpen }) =>
  url ? (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      title={title}
      aria-label={title}
      onClick={() => {
        const popup = window.open(url, windowName);
        popup?.focus();
        onOpen?.();
      }}
    >
      <SquareArrowOutUpRight className="h-3.5 w-3.5" />
    </button>
  ) : null;

const OpenEditorIconLink: React.FC<{
  editorUrl: string;
  openFileUrl: string;
  filePath?: string;
}> = ({ editorUrl, openFileUrl, filePath }) => (
  <OpenExternalIconLink
    url={editorUrl}
    title="在 Sandbox 编辑器中打开"
    windowName="amigo-sandbox-editor"
    onOpen={() => {
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
  />
);

const OpenPreviewIconLink: React.FC<{
  previewUrl: string;
}> = ({ previewUrl }) => (
  <OpenExternalIconLink url={previewUrl} title="打开开发预览" windowName="amigo-sandbox-preview" />
);

export const SandboxToolRenderer: React.FC<ToolMessageRendererProps<ToolNames>> = (props) => {
  const businessError = readBusinessToolError(
    String(props.message.toolName),
    props.message.toolOutput,
  );
  const message =
    businessError && !props.message.hasError
      ? {
          ...props.message,
          hasError: true,
          error: businessError,
        }
      : props.message;
  const normalizedProps =
    message === props.message
      ? props
      : {
          ...props,
          message,
        };
  const { mainTaskId, currentTaskId } = useTasks();
  const { config } = useWebSocketContext();
  const sandboxId = mainTaskId || currentTaskId;
  const toolName = String(message.toolName);
  const editorUrl = getSandboxEditorUrl(config.url, sandboxId);
  const openFileUrl = getSandboxOpenFileUrl(config.url, sandboxId);
  const previewUrl = getSandboxPreviewUrl(config.url, sandboxId);
  const isCompleted = message.toolOutput !== undefined;
  const isLoading = message.partial === true;

  if (toolName === "editFile") {
    const params = (message.params ?? {}) as Record<string, unknown>;
    const filePath = typeof params.filePath === "string" ? params.filePath : "";
    const batchEdits = Array.isArray(params.edits)
      ? params.edits.filter(
          (edit): edit is { filePath?: string; oldString?: string; newString?: string } =>
            !!edit && typeof edit === "object",
        )
      : [];
    const singleBatchFilePath =
      !filePath &&
      batchEdits.length === 1 &&
      typeof batchEdits[0]?.filePath === "string" &&
      batchEdits[0].filePath.trim().length > 0
        ? batchEdits[0].filePath
        : "";
    const resolvedFilePath = filePath || singleBatchFilePath;
    const hasEditPreview =
      (typeof params.oldString === "string" && typeof params.newString === "string") ||
      typeof params.newString === "string" ||
      batchEdits.length > 0;
    const action =
      !message.partial && resolvedFilePath ? (
        <OpenEditorIconLink
          editorUrl={editorUrl}
          openFileUrl={openFileUrl}
          filePath={resolvedFilePath}
        />
      ) : undefined;
    const title = filePath
      ? `编辑文件: ${filePath}`
      : batchEdits.length > 0
        ? `批量编辑文件: ${batchEdits.length} 项`
        : "编辑文件";

    return (
      <ToolAccordion
        title={title}
        action={action}
        isLoading={isLoading}
        hasError={message.hasError}
        error={message.error}
      >
        {(isCompleted || hasEditPreview) && (
          <EditFileResultBody
            message={message as React.ComponentProps<typeof EditFileResultBody>["message"]}
            isLatest={props.isLatest}
          />
        )}
      </ToolAccordion>
    );
  }

  if (toolName === "readFile") {
    const params = (message.params ?? {}) as Record<string, unknown>;
    const filePaths = Array.isArray(params.filePaths)
      ? params.filePaths.filter((filePath): filePath is string => typeof filePath === "string")
      : [];
    const singleFilePath = filePaths.length === 1 ? filePaths[0] : "";
    const action =
      !message.partial && singleFilePath ? (
        <OpenEditorIconLink
          editorUrl={editorUrl}
          openFileUrl={openFileUrl}
          filePath={singleFilePath}
        />
      ) : undefined;
    const title =
      filePaths.length === 1 ? `读取文件: ${singleFilePath}` : `读取文件: ${filePaths.length} 个`;

    return (
      <ToolAccordion
        title={title}
        action={action}
        isLoading={isLoading}
        hasError={message.hasError}
        error={message.error}
      >
        {isCompleted && (
          <ReadFileResultBody
            message={message as React.ComponentProps<typeof ReadFileResultBody>["message"]}
            isLatest={props.isLatest}
          />
        )}
      </ToolAccordion>
    );
  }

  if (toolName === "updateDevServer") {
    const params = (message.params ?? {}) as Record<string, unknown>;
    const toolOutput =
      message.toolOutput && typeof message.toolOutput === "object"
        ? (message.toolOutput as Record<string, unknown>)
        : undefined;
    const status = typeof toolOutput?.status === "string" ? toolOutput.status : "";
    const action =
      !message.partial && status === "completed" && previewUrl ? (
        <OpenPreviewIconLink previewUrl={previewUrl} />
      ) : undefined;
    const workingDir =
      typeof toolOutput?.workingDir === "string"
        ? toolOutput.workingDir
        : typeof params.workingDir === "string"
          ? params.workingDir
          : ".";
    const startCommand =
      typeof toolOutput?.startCommand === "string"
        ? toolOutput.startCommand
        : typeof params.startCommand === "string"
          ? params.startCommand
          : "";
    const logPath = typeof toolOutput?.logPath === "string" ? toolOutput.logPath : "";
    const statusText = status === "completed" ? "开发预览已就绪" : "开发预览处理中";

    return (
      <ToolAccordion
        title="更新开发预览"
        action={action}
        isLoading={message.partial === true}
        hasError={message.hasError}
        error={message.error}
      >
        <div className="space-y-2 text-sm text-neutral-700">
          <div className="font-medium text-neutral-900">{statusText}</div>
          <div>
            <span className="font-medium text-neutral-900">目录:</span> {workingDir}
          </div>
          {startCommand && (
            <div className="rounded-md bg-neutral-100 p-2 font-mono text-xs break-all">
              {startCommand}
            </div>
          )}
          {logPath && <div className="text-xs text-neutral-500">日志: {logPath}</div>}
        </div>
      </ToolAccordion>
    );
  }

  if (toolName === "listFiles") {
    return (
      <DefaultListFilesRenderer
        {...(normalizedProps as React.ComponentProps<typeof DefaultListFilesRenderer>)}
      />
    );
  }

  if (
    toolName === "designSession" ||
    toolName === "readDesignSession" ||
    toolName === "upsertDesignSession"
  ) {
    return <DesignSessionToolRenderer {...normalizedProps} />;
  }

  if (
    toolName === "readLayoutOptions" ||
    toolName === "upsertLayoutOptions" ||
    (toolName === "designOptions" &&
      (((message.params as Record<string, unknown> | undefined)?.kind as string | undefined) ===
        "layout" ||
        ((message.toolOutput as Record<string, unknown> | undefined)?.kind as
          | string
          | undefined) === "layout"))
  ) {
    return <LayoutOptionsToolRenderer {...normalizedProps} />;
  }

  if (
    toolName === "readThemeOptions" ||
    toolName === "upsertThemeOptions" ||
    (toolName === "designOptions" &&
      (((message.params as Record<string, unknown> | undefined)?.kind as string | undefined) ===
        "theme" ||
        ((message.toolOutput as Record<string, unknown> | undefined)?.kind as
          | string
          | undefined) === "theme"))
  ) {
    return <ThemeOptionsToolRenderer {...normalizedProps} />;
  }

  if (toolName === "readModuleDrafts" || toolName === "upsertModuleDrafts") {
    return <ModuleDraftToolRenderer {...normalizedProps} />;
  }

  if (
    toolName === "designDraft" ||
    toolName === "readFinalDesignDraft" ||
    toolName === "orchestrateFinalDesignDraft" ||
    toolName === "readDraftCritique"
  ) {
    return <DesignDraftToolRenderer {...normalizedProps} />;
  }

  return <DefaultToolRenderer {...normalizedProps} />;
};
