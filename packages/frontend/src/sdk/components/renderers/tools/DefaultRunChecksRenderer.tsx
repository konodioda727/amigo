import type { RunChecksResult } from "@amigo-llm/types";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";
import { ToolCodeBlock } from "./ToolCodeBlock";

const dependencyStatusLabelMap: Record<string, string> = {
  pending: "等待安装",
  running: "安装中",
  success: "已安装",
  failed: "安装失败",
  not_required: "无需安装",
};

const runChecksOverallStatusLabelMap: Record<string, string> = {
  passed: "检查全部通过",
  partial: "检查已完成，存在未通过项",
  failed: "检查未通过",
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

const getStatusClassName = (status: string): string => {
  if (status === "passed") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "running") {
    return "bg-sky-100 text-sky-700";
  }
  if (status === "blocked") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-rose-100 text-rose-700";
};

const asRunChecksResult = (value: unknown): Partial<RunChecksResult> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Partial<RunChecksResult>)
    : undefined;

export const DefaultRunChecksRenderer: React.FC<ToolMessageRendererProps<"runChecks">> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;
  const result = asRunChecksResult(toolOutput);
  const overallStatus =
    typeof result?.overallStatus === "string" ? result.overallStatus : undefined;
  const preset =
    typeof result?.preset === "string"
      ? result.preset
      : typeof params.preset === "string"
        ? params.preset
        : Array.isArray(params.commands) && params.commands.length > 0
          ? "custom"
          : "quick";
  const workingDir =
    typeof result?.workingDir === "string"
      ? result.workingDir
      : typeof params.workingDir === "string"
        ? params.workingDir
        : ".";
  const dependencyStatus =
    typeof result?.dependencyStatus === "string" ? result.dependencyStatus : undefined;
  const failedSteps = readStringArray(result?.failedSteps);
  const steps = Array.isArray(result?.steps)
    ? result.steps.map(asRecord).filter((step): step is Record<string, unknown> => !!step)
    : [];
  const title = preset === "test" ? "运行测试" : "运行检查";
  const summary =
    typeof result?.message === "string" && result.message.trim()
      ? result.message
      : overallStatus
        ? runChecksOverallStatusLabelMap[overallStatus] || "检查进行中"
        : "检查进行中";
  const paramCommands = Array.isArray(params.commands)
    ? params.commands.filter((item): item is string => typeof item === "string")
    : [];
  const pendingCommands =
    steps.length === 0
      ? paramCommands
      : paramCommands.filter((command) => !steps.some((step) => step.command === command));
  const isExpandedDefault =
    overallStatus === "failed" ||
    overallStatus === "partial" ||
    overallStatus === "waiting_for_dependencies" ||
    isLoading;

  return (
    <ToolAccordion
      title={title}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
      isExpandedDefault={isExpandedDefault}
    >
      {(isCompleted || Object.keys(params).length > 0) && (
        <div className="space-y-3 text-sm text-neutral-700">
          <div className="font-medium text-neutral-900">{summary}</div>
          <div className="text-xs text-neutral-500">
            {workingDir} · {preset}
            {dependencyStatus
              ? ` · ${dependencyStatusLabelMap[dependencyStatus] || dependencyStatus}`
              : ""}
          </div>
          {failedSteps.length > 0 ? (
            <div className="text-xs text-rose-600">未通过步骤: {failedSteps.join(", ")}</div>
          ) : null}
          {steps.map((step, index) => {
            const name = typeof step.name === "string" ? step.name : `step_${index + 1}`;
            const command = typeof step.command === "string" ? step.command : "";
            const status = typeof step.status === "string" ? step.status : "";
            const durationMs = typeof step.durationMs === "number" ? step.durationMs : undefined;
            const outputTail = typeof step.outputTail === "string" ? step.outputTail : "";
            const exitCode = typeof step.exitCode === "number" ? step.exitCode : undefined;

            return (
              <div
                key={`${name}-${command || index}`}
                className="space-y-2 rounded-lg border border-neutral-200 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-neutral-900">{name}</div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${getStatusClassName(status)}`}
                  >
                    {runChecksStepStatusLabelMap[status] || status || "未知"}
                  </span>
                  {typeof durationMs === "number" ? (
                    <span className="text-xs text-neutral-500">{durationMs}ms</span>
                  ) : null}
                  {typeof exitCode === "number" ? (
                    <span className="text-xs text-neutral-500">exit {exitCode}</span>
                  ) : null}
                </div>
                <ToolCodeBlock command={command} output={outputTail} />
              </div>
            );
          })}
          {pendingCommands.map((command) => (
            <div
              key={command}
              className="space-y-2 rounded-lg border border-dashed border-neutral-200 p-3"
            >
              <div className="text-xs font-medium text-neutral-500">待执行命令</div>
              <ToolCodeBlock command={command} />
            </div>
          ))}
        </div>
      )}
    </ToolAccordion>
  );
};
