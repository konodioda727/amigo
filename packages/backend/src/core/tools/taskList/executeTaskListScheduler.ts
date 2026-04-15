import { ExecutionTaskInterruptedError } from "@/core/conversation/orchestration/conversationOrchestratorExecution";
import { getTaskId, type parseChecklist } from "@/core/templates/checklistParser";
import {
  CONCURRENCY_LIMIT,
  getTaskPriority,
  type TaskExecutionResult,
  type TaskExecutionType,
} from "./executeTaskListShared";

const isTaskReady = ({
  item,
  completedTaskIds,
  runningTaskIds,
}: {
  item: ReturnType<typeof parseChecklist>["items"][number];
  completedTaskIds: Set<string>;
  runningTaskIds: Set<string>;
}) => {
  const id = getTaskId(item.description);
  if (!id) return false;
  if (item.completed) return false;
  if (completedTaskIds.has(id)) return false;
  if (runningTaskIds.has(id)) return false;
  if (item.dependencies && item.dependencies.length > 0) {
    return item.dependencies.every((depId) => completedTaskIds.has(depId));
  }
  return true;
};

const runWithConcurrency = async <T>(
  tasks: T[],
  worker: (task: T) => Promise<void>,
  concurrency = CONCURRENCY_LIMIT,
) => {
  if (tasks.length === 0) return;
  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < tasks.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const task = tasks[currentIndex];
        if (task === undefined) continue;
        await worker(task);
      }
    }),
  );
};

export const resolveExecutionTaskFailureState = (error: unknown) => {
  const errorMsg = error instanceof Error ? error.message : String(error);

  if (error instanceof ExecutionTaskInterruptedError) {
    return {
      summary: "任务被用户打断，执行未完成。",
      outcome: "interrupted" as const,
      status: "interrupted" as const,
      error: "任务被用户打断",
      completedAt: new Date().toISOString(),
    };
  }

  return {
    summary: `任务执行失败: ${errorMsg}`,
    outcome: "failed" as const,
    status: "failed" as const,
    error: errorMsg,
    completedAt: new Date().toISOString(),
  };
};

export const runTaskScheduler = async ({
  allTasks,
  runningTaskIds,
  completedTaskIds,
  getExecutionType,
  onRunTask,
}: {
  allTasks: ReturnType<typeof parseChecklist>["items"];
  runningTaskIds: Set<string>;
  completedTaskIds: Set<string>;
  getExecutionType: (item: ReturnType<typeof parseChecklist>["items"][number]) => TaskExecutionType;
  onRunTask: (
    taskItem: ReturnType<typeof parseChecklist>["items"][number],
  ) => Promise<TaskExecutionResult>;
}) => {
  const pendingTaskMap = new Map<string, ReturnType<typeof parseChecklist>["items"][number]>();
  for (const item of allTasks) {
    const id = getTaskId(item.description);
    if (!id || item.completed || completedTaskIds.has(id)) continue;
    pendingTaskMap.set(id, item);
  }

  let shouldStopScheduling = false;

  while (pendingTaskMap.size > 0) {
    if (shouldStopScheduling) {
      break;
    }

    const readyTasks = Array.from(pendingTaskMap.values())
      .filter((item) => isTaskReady({ item, completedTaskIds, runningTaskIds }))
      .sort((a, b) => {
        const priorityDiff =
          getTaskPriority(getExecutionType(a)) - getTaskPriority(getExecutionType(b));
        if (priorityDiff !== 0) return priorityDiff;
        return (
          (a.lineNumber ?? Number.POSITIVE_INFINITY) - (b.lineNumber ?? Number.POSITIVE_INFINITY)
        );
      });

    if (readyTasks.length === 0) {
      break;
    }

    await runWithConcurrency(readyTasks, async (taskItem) => {
      if (shouldStopScheduling) {
        return;
      }

      const id = getTaskId(taskItem.description);
      if (!id) return;
      runningTaskIds.add(id);
      try {
        const result = await onRunTask(taskItem);
        if (result.outcome === "failed" || result.outcome === "interrupted") {
          shouldStopScheduling = true;
        }
      } finally {
        runningTaskIds.delete(id);
        pendingTaskMap.delete(id);
      }
    });
  }
};
