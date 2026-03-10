import {
  DefaultToolRenderer,
  EditFileResultBody,
  ReadFileResultBody,
  ToolAccordion,
  type ToolMessageRendererProps,
  useTasks,
  useWebSocketContext,
} from "@amigo-llm/frontend";
import type { ToolNames } from "@amigo-llm/types";
import { FileEdit, FileText, Play, SquareArrowOutUpRight } from "lucide-react";
import type React from "react";
import {
  getSandboxEditorUrl,
  getSandboxOpenFileUrl,
  getSandboxPreviewUrl,
} from "../utils/sandboxEditor";

const dependencyStatusLabelMap: Record<string, string> = {
  pending: "等待安装",
  running: "安装中",
  success: "已安装",
  failed: "安装失败",
  not_required: "无需安装",
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
  const { message } = props;
  const { mainTaskId, currentTaskId } = useTasks();
  const { config } = useWebSocketContext();
  const sandboxId = mainTaskId || currentTaskId;
  const editorUrl = getSandboxEditorUrl(config.url, sandboxId);
  const openFileUrl = getSandboxOpenFileUrl(config.url, sandboxId);
  const previewUrl = getSandboxPreviewUrl(config.url, sandboxId);
  const isCompleted = !!message.toolOutput;
  const isLoading = message.partial !== undefined ? message.partial : !isCompleted;

  if (message.toolName === "editFile") {
    const params = (message.params ?? {}) as Record<string, unknown>;
    const filePath = typeof params.filePath === "string" ? params.filePath : "";
    const hasEditPreview = typeof params.content === "string" || typeof params.replace === "string";
    const action =
      !message.partial && filePath ? (
        <OpenEditorIconLink editorUrl={editorUrl} openFileUrl={openFileUrl} filePath={filePath} />
      ) : undefined;

    return (
      <ToolAccordion
        icon={<FileEdit size={14} />}
        title={`编辑文件: ${filePath}`}
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
    const params = (message.params ?? {}) as Record<string, unknown>;
    const filePath = typeof params.filePath === "string" ? params.filePath : "";
    const action =
      !message.partial && filePath ? (
        <OpenEditorIconLink editorUrl={editorUrl} openFileUrl={openFileUrl} filePath={filePath} />
      ) : undefined;

    return (
      <ToolAccordion
        icon={<FileText size={14} />}
        title={`读取文件: ${filePath}`}
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

  if (message.toolName === "updateDevServer") {
    const params = (message.params ?? {}) as Record<string, unknown>;
    const toolOutput =
      message.toolOutput && typeof message.toolOutput === "object"
        ? (message.toolOutput as Record<string, unknown>)
        : undefined;
    const status = typeof toolOutput?.status === "string" ? toolOutput.status : "";
    const action =
      !message.partial && previewUrl ? <OpenPreviewIconLink previewUrl={previewUrl} /> : undefined;
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
      status === "already_running"
        ? "后台任务已在运行"
        : status === "started"
          ? "后台任务已启动，预览可从右上角打开"
          : "开发预览已就绪";

    return (
      <ToolAccordion
        icon={<Play size={14} />}
        title="更新开发预览"
        action={action}
        isLoading={message.partial !== undefined ? message.partial : !isCompleted}
        hasError={message.hasError}
        error={message.error}
        isExpandedDefault={true}
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

  return <DefaultToolRenderer {...props} />;
};
