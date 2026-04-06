import {
  DefaultListFilesRenderer,
  DefaultRunChecksRenderer,
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

const dependencyStatusLabelMap: Record<string, string> = {
  pending: "等待安装",
  running: "安装中",
  success: "已安装",
  failed: "安装失败",
  not_required: "无需安装",
};

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

const statusFirstToolNames = new Set([
  "installDependencies",
  "listFiles",
  "runChecks",
  "runTest",
  "updateDevServer",
]);

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
    const hasEditPreview = typeof params.content === "string" || typeof params.replace === "string";
    const action =
      !message.partial && filePath ? (
        <OpenEditorIconLink editorUrl={editorUrl} openFileUrl={openFileUrl} filePath={filePath} />
      ) : undefined;

    return (
      <ToolAccordion
        title={`编辑文件: ${filePath}`}
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
    const jobId = typeof toolOutput?.jobId === "string" ? toolOutput.jobId : "";
    const dependencyStatus =
      typeof toolOutput?.dependencyStatus === "string" ? toolOutput.dependencyStatus : "";
    const statusText =
      status === "waiting_for_dependencies"
        ? "依赖安装中，开发预览会在完成后自动启动"
        : status === "already_waiting_for_dependencies"
          ? "开发预览正在等待依赖安装完成"
          : "开发预览已就绪";

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
          {dependencyStatus && (
            <div>
              <span className="font-medium text-neutral-900">依赖状态:</span>{" "}
              {dependencyStatusLabelMap[dependencyStatus] || dependencyStatus}
            </div>
          )}
          {jobId && <div className="text-xs text-neutral-500">任务编号: {jobId}</div>}
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

  if (toolName === "installDependencies") {
    const params = (message.params ?? {}) as Record<string, unknown>;
    const toolOutput =
      message.toolOutput && typeof message.toolOutput === "object"
        ? (message.toolOutput as Record<string, unknown>)
        : undefined;
    const workingDir =
      typeof toolOutput?.workingDir === "string"
        ? toolOutput.workingDir
        : typeof params.workingDir === "string"
          ? params.workingDir
          : ".";
    const packageManager =
      typeof toolOutput?.packageManager === "string" ? toolOutput.packageManager : "";
    const installCommand =
      typeof toolOutput?.installCommand === "string"
        ? toolOutput.installCommand
        : typeof params.installCommand === "string"
          ? params.installCommand
          : "";
    const logPath = typeof toolOutput?.logPath === "string" ? toolOutput.logPath : "";
    const status = typeof toolOutput?.status === "string" ? toolOutput.status : "";
    const jobId = typeof toolOutput?.jobId === "string" ? toolOutput.jobId : "";
    const dependencyStatus =
      typeof toolOutput?.dependencyStatus === "string" ? toolOutput.dependencyStatus : "";
    const statusText =
      status === "started"
        ? "依赖下载已开始，可先继续修改代码"
        : status === "already_running"
          ? "依赖正在下载中，可先继续修改代码"
          : dependencyStatus === "not_required"
            ? "当前目录无需安装依赖"
            : "依赖已安装并可复用";

    return (
      <ToolAccordion
        title="安装项目依赖"
        isLoading={message.partial === true}
        hasError={message.hasError}
        error={message.error}
      >
        <div className="space-y-2 text-sm text-neutral-700">
          <div className="font-medium text-neutral-900">{statusText}</div>
          <div>
            <span className="font-medium text-neutral-900">目录:</span> {workingDir}
          </div>
          {dependencyStatus && (
            <div>
              <span className="font-medium text-neutral-900">依赖状态:</span>{" "}
              {dependencyStatusLabelMap[dependencyStatus] || dependencyStatus}
            </div>
          )}
          {packageManager && (
            <div>
              <span className="font-medium text-neutral-900">包管理器:</span> {packageManager}
            </div>
          )}
          {jobId && <div className="text-xs text-neutral-500">任务编号: {jobId}</div>}
          {installCommand && (
            <div className="rounded-md bg-neutral-100 p-2 font-mono text-xs break-all">
              {installCommand}
            </div>
          )}
          {logPath && <div className="text-xs text-neutral-500">日志: {logPath}</div>}
        </div>
      </ToolAccordion>
    );
  }

  if (toolName === "runChecks" || toolName === "runTest") {
    return (
      <DefaultRunChecksRenderer
        {...(normalizedProps as React.ComponentProps<typeof DefaultRunChecksRenderer>)}
      />
    );
  }

  if (toolName === "listFiles") {
    return (
      <DefaultListFilesRenderer
        {...(normalizedProps as React.ComponentProps<typeof DefaultListFilesRenderer>)}
      />
    );
  }

  if (toolName === "readDesignSession" || toolName === "upsertDesignSession") {
    return <DesignSessionToolRenderer {...normalizedProps} />;
  }

  if (toolName === "readLayoutOptions" || toolName === "upsertLayoutOptions") {
    return <LayoutOptionsToolRenderer {...normalizedProps} />;
  }

  if (toolName === "readThemeOptions" || toolName === "upsertThemeOptions") {
    return <ThemeOptionsToolRenderer {...normalizedProps} />;
  }

  if (toolName === "readModuleDrafts" || toolName === "upsertModuleDrafts") {
    return <ModuleDraftToolRenderer {...normalizedProps} />;
  }

  if (
    toolName === "readFinalDesignDraft" ||
    toolName === "orchestrateFinalDesignDraft" ||
    toolName === "readDraftCritique"
  ) {
    return <DesignDraftToolRenderer {...normalizedProps} />;
  }

  return <DefaultToolRenderer {...normalizedProps} />;
};
