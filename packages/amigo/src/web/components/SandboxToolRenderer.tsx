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

const runChecksOverallStatusLabelMap: Record<string, string> = {
  passed: "检查全部通过",
  partial: "部分检查失败",
  failed: "检查失败",
  waiting_for_dependencies: "等待依赖安装后自动继续",
};

const runChecksStepStatusLabelMap: Record<string, string> = {
  passed: "通过",
  failed: "失败",
  timeout: "超时",
  blocked: "已拦截",
  running: "运行中",
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

const readBusinessToolError = (toolOutput: unknown): string | undefined => {
  const output = asRecord(toolOutput);
  if (!output || output.success !== false) {
    return undefined;
  }

  const validationErrors = readStringArray(output.validationErrors);
  if (validationErrors.length > 0) {
    return validationErrors[0];
  }

  if (typeof output.message === "string" && output.message.trim()) {
    return output.message.trim();
  }

  return "工具执行失败";
};

const RunChecksToolBody: React.FC<{
  params: Record<string, unknown>;
  toolOutput?: Record<string, unknown>;
}> = ({ params, toolOutput }) => {
  const workingDir =
    typeof toolOutput?.workingDir === "string"
      ? toolOutput.workingDir
      : typeof params.workingDir === "string"
        ? params.workingDir
        : ".";
  const preset =
    typeof toolOutput?.preset === "string"
      ? toolOutput.preset
      : typeof params.preset === "string"
        ? params.preset
        : "quick";
  const dependencyStatus =
    typeof toolOutput?.dependencyStatus === "string" ? toolOutput.dependencyStatus : "";
  const overallStatus =
    typeof toolOutput?.overallStatus === "string" ? toolOutput.overallStatus : "";
  const jobId = typeof toolOutput?.jobId === "string" ? toolOutput.jobId : "";
  const summary =
    typeof toolOutput?.message === "string"
      ? toolOutput.message
      : runChecksOverallStatusLabelMap[overallStatus] || "检查进行中";
  const paramCommands = Array.isArray(params.commands)
    ? params.commands
        .map((item) => {
          const row = asRecord(item);
          return typeof row?.command === "string" ? row.command : undefined;
        })
        .filter((item): item is string => typeof item === "string")
    : readStringArray(params.commands);
  const steps = Array.isArray(toolOutput?.steps)
    ? toolOutput.steps.map(asRecord).filter(Boolean)
    : [];
  const failedSteps = readStringArray(toolOutput?.failedSteps);

  return (
    <div className="space-y-3 text-sm text-neutral-700">
      <div className="font-medium text-neutral-900">{summary}</div>
      <div>
        <span className="font-medium text-neutral-900">目录:</span> {workingDir}
      </div>
      <div>
        <span className="font-medium text-neutral-900">检查集:</span> {preset}
      </div>
      {dependencyStatus && (
        <div>
          <span className="font-medium text-neutral-900">依赖状态:</span>{" "}
          {dependencyStatusLabelMap[dependencyStatus] || dependencyStatus}
        </div>
      )}
      {jobId && <div className="text-xs text-neutral-500">任务编号: {jobId}</div>}
      {paramCommands.length > 0 && (
        <div className="space-y-1">
          <div className="font-medium text-neutral-900">命令</div>
          {paramCommands.map((command) => (
            <div
              key={command}
              className="rounded-md bg-neutral-100 p-2 font-mono text-xs break-all"
            >
              {command}
            </div>
          ))}
        </div>
      )}
      {failedSteps.length > 0 && (
        <div className="text-xs text-red-600">失败步骤: {failedSteps.join(", ")}</div>
      )}
      {steps.length > 0 && (
        <div className="space-y-2">
          <div className="font-medium text-neutral-900">执行结果</div>
          {steps.map((step, index) => {
            const name = typeof step?.name === "string" ? step.name : `step_${index + 1}`;
            const command = typeof step?.command === "string" ? step.command : "";
            const status = typeof step?.status === "string" ? step.status : "";
            const durationMs = typeof step?.durationMs === "number" ? step.durationMs : undefined;
            const outputTail = typeof step?.outputTail === "string" ? step.outputTail : "";
            const exitCode = typeof step?.exitCode === "number" ? step.exitCode : undefined;
            const statusLabel = runChecksStepStatusLabelMap[status] || status || "未知";
            const statusClassName =
              status === "passed"
                ? "bg-green-100 text-green-700"
                : status === "running"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-red-100 text-red-700";

            return (
              <div
                key={`${name}-${command || "no-command"}`}
                className="rounded-lg border border-neutral-200 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-neutral-900">{name}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusClassName}`}>
                    {statusLabel}
                  </span>
                  {typeof durationMs === "number" && (
                    <span className="text-xs text-neutral-500">{durationMs}ms</span>
                  )}
                  {typeof exitCode === "number" && (
                    <span className="text-xs text-neutral-500">exit {exitCode}</span>
                  )}
                </div>
                {command && (
                  <div className="mt-2 rounded-md bg-neutral-100 p-2 font-mono text-xs break-all">
                    {command}
                  </div>
                )}
                {outputTail && (
                  <div className="mt-2 rounded-md bg-neutral-950 px-3 py-2 font-mono text-xs whitespace-pre-wrap break-all text-neutral-200">
                    {outputTail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
  const businessError = readBusinessToolError(props.message.toolOutput);
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
    const params = asRecord(message.params) ?? {};
    const toolOutput = asRecord(message.toolOutput);
    const preset =
      typeof toolOutput?.preset === "string"
        ? toolOutput.preset
        : typeof params.preset === "string"
          ? params.preset
          : "";
    const title = preset === "test" || toolName === "runTest" ? "运行测试" : "运行检查";
    const overallStatus =
      typeof toolOutput?.overallStatus === "string" ? toolOutput.overallStatus : "";
    const isExpandedDefault = overallStatus === "failed" || overallStatus === "partial";

    return (
      <ToolAccordion
        title={title}
        isLoading={isLoading}
        hasError={message.hasError}
        error={message.error}
        isExpandedDefault={isExpandedDefault}
      >
        {(isCompleted || Object.keys(params).length > 0) && (
          <RunChecksToolBody params={params} toolOutput={toolOutput} />
        )}
      </ToolAccordion>
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
