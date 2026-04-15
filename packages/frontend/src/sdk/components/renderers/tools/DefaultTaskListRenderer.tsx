import { CheckCircle2, Circle } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";
import { ToolCodeBlock } from "./ToolCodeBlock";

interface TaskListEntry {
  id: string;
  title: string;
  deps?: string[];
  completed?: boolean;
}

const getTaskListEntries = (
  message: ToolMessageRendererProps<"taskList">["message"],
): TaskListEntry[] => {
  const result = message.toolOutput;
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { tasks?: unknown[] }).tasks)
  ) {
    return (result as { tasks: TaskListEntry[] }).tasks;
  }

  if (Array.isArray(message.params?.tasks)) {
    return message.params.tasks as TaskListEntry[];
  }

  return [];
};

const getTaskListMarkdown = (message: ToolMessageRendererProps<"taskList">["message"]): string => {
  const result = message.toolOutput;
  if (
    result &&
    typeof result === "object" &&
    typeof (result as { markdown?: unknown }).markdown === "string"
  ) {
    return (result as { markdown: string }).markdown;
  }

  return "";
};

const getTaskListSummary = (
  message: ToolMessageRendererProps<"taskList">["message"],
  taskCount: number,
): string => {
  const result = message.toolOutput;
  if (
    result &&
    typeof result === "object" &&
    typeof (result as { message?: unknown }).message === "string"
  ) {
    return (result as { message: string }).message;
  }

  if (message.params?.action === "read") {
    return taskCount > 0 ? `读取到 ${taskCount} 条任务` : "读取任务清单";
  }

  if (message.params?.action === "replace") {
    return taskCount > 0 ? `更新 ${taskCount} 条任务` : "更新任务清单";
  }

  if (message.params?.action === "execute") {
    return taskCount > 0 ? `执行 ${taskCount} 条任务` : "执行任务清单";
  }

  return taskCount > 0 ? `处理 ${taskCount} 条任务` : "处理任务清单";
};

const getTaskListTitle = (message: ToolMessageRendererProps<"taskList">["message"]): string => {
  if (message.params?.action === "read") return "读取任务清单";
  if (message.params?.action === "replace") return "更新任务清单";
  if (message.params?.action === "execute") return "执行任务清单";
  return "处理任务清单";
};

export const DefaultTaskListRenderer: React.FC<ToolMessageRendererProps<"taskList">> = ({
  message,
}) => {
  const { toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;
  const tasks = getTaskListEntries(message);
  const markdown = getTaskListMarkdown(message);
  const completedCount = tasks.filter((task) => task.completed).length;
  const summary = getTaskListSummary(message, tasks.length);
  const result =
    toolOutput && typeof toolOutput === "object"
      ? (toolOutput as {
          status?: string;
          executed?: number;
          successCount?: number;
          failedCount?: number;
          interruptedCount?: number;
          blockedCount?: number;
        })
      : null;
  const hasExecutionMetrics =
    typeof result?.executed === "number" ||
    typeof result?.successCount === "number" ||
    typeof result?.failedCount === "number" ||
    typeof result?.interruptedCount === "number" ||
    typeof result?.blockedCount === "number";

  return (
    <ToolAccordion
      title={getTaskListTitle(message)}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {isCompleted || tasks.length > 0 ? (
        <div className="space-y-3 text-sm text-neutral-700">
          <div className="whitespace-pre-wrap">{summary}</div>
          {hasExecutionMetrics ? (
            <div className="grid grid-cols-2 gap-2 text-xs text-neutral-500 sm:grid-cols-5">
              <div>执行: {result?.executed ?? 0}</div>
              <div>成功: {result?.successCount ?? 0}</div>
              <div>失败: {result?.failedCount ?? 0}</div>
              <div>中断: {result?.interruptedCount ?? 0}</div>
              <div>阻塞: {result?.blockedCount ?? 0}</div>
            </div>
          ) : null}
          {tasks.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs text-neutral-500">
                共 {tasks.length} 项，已完成 {completedCount} 项
              </div>
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={`${task.id}-${task.title}`}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-2"
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0">
                        {task.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-neutral-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words font-medium text-neutral-800">
                          {`Task ${task.id}: ${task.title}`}
                        </div>
                        {task.deps && task.deps.length > 0 ? (
                          <div className="mt-1 text-xs text-neutral-500">
                            依赖: {task.deps.map((dep) => `Task ${dep}`).join(", ")}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {markdown ? <ToolCodeBlock className="max-h-64 overflow-auto" output={markdown} /> : null}
        </div>
      ) : (
        <div className="text-sm text-neutral-600">任务清单处理中。</div>
      )}
    </ToolAccordion>
  );
};
