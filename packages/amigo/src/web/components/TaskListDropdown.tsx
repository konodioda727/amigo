import { useTasks } from "@amigo-llm/frontend";
import type { ExecutionTaskStatus } from "@amigo-llm/types";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  ListTodo,
  PlayCircle,
  XCircle,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface TaskListItem {
  rawDescription: string;
  normalizedDescription: string;
  displayDescription: string;
  taskKey: string;
  isCompleted: boolean;
}

type TaskSidebarStatus = "running" | "interrupted" | "completed" | "failed" | undefined;

const TASK_LIST_LINE_PATTERN = /^\s*-\s+\[([ xX])\]\s+(.+)$/;
const IN_PROGRESS_SUFFIX_PATTERN = /\s*\(In Progress\)\s*$/i;
const TASK_ID_PATTERN = /\bTask\s+([A-Za-z0-9][A-Za-z0-9._-]*)\s*[:：]?/i;
const TASK_ID_TAG_PATTERN = /\[id:\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*\]/i;
const STATUS_TRANSITION_HOLD_MS = 900;

const getLatestTaskListMarkdown = (messages: Array<{ type?: string; data?: unknown }>): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.type !== "tool") {
      continue;
    }

    try {
      const payload = JSON.parse((message.data as { message?: string })?.message || "{}") as {
        toolName?: string;
        result?: { markdown?: string };
      };
      if (payload.toolName !== "taskList") {
        continue;
      }
      if (typeof payload.result?.markdown === "string" && payload.result.markdown.trim()) {
        return payload.result.markdown;
      }
    } catch {
      // ignore malformed tool payloads
    }
  }

  return "";
};

export const getTaskListStatusMap = (
  taskStatusMaps: Record<string, Record<string, ExecutionTaskStatus> | undefined>,
  mainTaskId: string | null | undefined,
): Record<string, ExecutionTaskStatus> => {
  if (!mainTaskId) {
    return {};
  }
  return taskStatusMaps[mainTaskId] ?? {};
};

const normalizeTaskDescription = (description: string): string =>
  description
    .replace(IN_PROGRESS_SUFFIX_PATTERN, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const extractTaskId = (description: string): string | null => {
  const normalized = normalizeTaskDescription(description);
  const idTagMatch = normalized.match(TASK_ID_TAG_PATTERN);
  if (idTagMatch?.[1]) {
    return idTagMatch[1];
  }

  const taskMatch = normalized.match(TASK_ID_PATTERN);
  return taskMatch?.[1] ?? null;
};

const parseTaskListLine = (line: string): TaskListItem | null => {
  const match = line.match(TASK_LIST_LINE_PATTERN);
  if (!match) {
    return null;
  }

  const checkmark = match[1];
  const rawDescription = match[2]?.trim() || "";
  const normalizedDescription = normalizeTaskDescription(rawDescription);
  const displayDescription = normalizedDescription.replace(
    /^\[id:\s*[A-Za-z0-9][A-Za-z0-9._-]*\s*\]\s*/i,
    "",
  );
  const taskId = extractTaskId(rawDescription);

  return {
    rawDescription,
    normalizedDescription,
    displayDescription,
    taskKey: taskId || normalizedDescription,
    isCompleted: checkmark?.toLowerCase() === "x",
  };
};

const findStatusEntry = (
  item: TaskListItem,
  statusMap?: Record<string, ExecutionTaskStatus>,
): ExecutionTaskStatus | undefined => {
  const lookupKeys = [
    item.taskKey,
    item.rawDescription,
    item.normalizedDescription,
    item.displayDescription,
  ];

  for (const key of lookupKeys) {
    if (!key) continue;
    if (statusMap?.[key]) {
      return statusMap[key];
    }
  }

  return undefined;
};

const resolveActiveWorkerTitle = ({
  items,
  statusMap,
  currentTaskId,
  mainTaskId,
}: {
  items: TaskListItem[];
  statusMap: Record<string, ExecutionTaskStatus>;
  currentTaskId: string | null;
  mainTaskId: string | null | undefined;
}): string | null => {
  if (!currentTaskId || !mainTaskId || currentTaskId === mainTaskId) {
    return null;
  }

  const matchedItem = items.find(
    (item) => findStatusEntry(item, statusMap)?.executionTaskId === currentTaskId,
  );
  if (matchedItem) {
    return matchedItem.displayDescription;
  }

  const matchedEntry = Object.entries(statusMap).find(
    ([, status]) => status.executionTaskId === currentTaskId,
  );
  if (!matchedEntry) {
    return null;
  }

  const [taskKey, status] = matchedEntry;
  return normalizeTaskDescription(status.description || taskKey) || null;
};

export const TaskListDropdown = ({ className = "" }: { className?: string }) => {
  const { mainTaskId, currentTaskId, switchTask, taskStatusMaps, tasks } = useTasks();
  const content = mainTaskId ? getLatestTaskListMarkdown(tasks[mainTaskId]?.rawMessages || []) : "";
  const statusMap = getTaskListStatusMap(taskStatusMaps, mainTaskId);

  const [isExpanded, setIsExpanded] = useState(false);

  const items = useMemo(() => {
    if (!content) return [];
    const lines = content.split("\n");
    return lines.map(parseTaskListLine).filter((item): item is TaskListItem => item !== null);
  }, [content]);

  if (items.length === 0) {
    return null;
  }

  const completedCount = items.filter((item) => item.isCompleted).length;
  const activeWorkerTitle = resolveActiveWorkerTitle({
    items,
    statusMap,
    currentTaskId,
    mainTaskId,
  });
  const isWorkerView = !!activeWorkerTitle;

  return (
    <div
      className={`w-full flex flex-col items-center px-1 pb-1.5 mb-1 ${isExpanded ? "border-b border-transparent" : ""} ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-50/70 hover:bg-slate-100/90 transition-colors text-xs font-medium text-slate-600 outline-none"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ListTodo className="w-3.5 h-3.5 text-slate-400" />
          <span className="truncate">
            {activeWorkerTitle || `共 ${items.length} 个任务，已经完成 ${completedCount} 个`}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className="w-full mt-1.5 px-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {isWorkerView && mainTaskId ? (
            <button
              type="button"
              onClick={() => switchTask(mainTaskId)}
              className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>返回主会话</span>
            </button>
          ) : null}
          <TaskListContent
            items={items}
            statusMap={statusMap}
            currentTaskId={currentTaskId}
            onTaskClick={(taskId) => taskId && switchTask(taskId)}
          />
        </div>
      )}
    </div>
  );
};

const TaskListContent: React.FC<{
  items: TaskListItem[];
  statusMap?: Record<string, ExecutionTaskStatus>;
  currentTaskId: string | null;
  onTaskClick: (taskId: string | undefined) => void;
}> = ({ items, statusMap = {}, currentTaskId, onTaskClick }) => {
  const transitionTimersRef = useRef<Record<string, number>>({});
  const [displayedStatuses, setDisplayedStatuses] = useState<Record<string, TaskSidebarStatus>>({});

  const getStatusEntry = useCallback(
    (item: TaskListItem) => findStatusEntry(item, statusMap),
    [statusMap],
  );

  useEffect(() => {
    return () => {
      for (const timer of Object.values(transitionTimersRef.current)) {
        window.clearTimeout(timer);
      }
      transitionTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const incomingStatuses = Object.fromEntries(
      items.map((item) => [item.taskKey, getStatusEntry(item)?.status as TaskSidebarStatus]),
    );

    setDisplayedStatuses((previous) => {
      const next = { ...previous };
      let changed = false;
      const validKeys = new Set(items.map((item) => item.taskKey));

      for (const key of Object.keys(next)) {
        if (validKeys.has(key)) continue;
        delete next[key];
        changed = true;
        const timer = transitionTimersRef.current[key];
        if (timer) {
          window.clearTimeout(timer);
          delete transitionTimersRef.current[key];
        }
      }

      for (const item of items) {
        const key = item.taskKey;
        const currentStatus = previous[key];
        const incomingStatus = incomingStatuses[key];
        const shouldHoldTransientRegression =
          currentStatus === "interrupted" &&
          currentStatus !== incomingStatus &&
          (incomingStatus === "running" || incomingStatus === undefined);

        if (shouldHoldTransientRegression) {
          if (!transitionTimersRef.current[key]) {
            transitionTimersRef.current[key] = window.setTimeout(() => {
              setDisplayedStatuses((latest) => {
                if (latest[key] === incomingStatus) {
                  return latest;
                }
                return {
                  ...latest,
                  [key]: incomingStatus,
                };
              });
              delete transitionTimersRef.current[key];
            }, STATUS_TRANSITION_HOLD_MS);
          }
          continue;
        }

        const timer = transitionTimersRef.current[key];
        if (timer) {
          window.clearTimeout(timer);
          delete transitionTimersRef.current[key];
        }

        if (currentStatus !== incomingStatus) {
          next[key] = incomingStatus;
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [items, getStatusEntry]);

  const getStatusIcon = (status: TaskSidebarStatus, isCompleted: boolean) => {
    if (status === "running")
      return <PlayCircle className="w-3.5 h-3.5 text-blue-500 animate-pulse" />;
    if (status === "interrupted") return <Circle className="w-3.5 h-3.5 text-amber-500" />;
    if (status === "completed" || isCompleted)
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    if (status === "failed") return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    return <Circle className="w-3.5 h-3.5 text-gray-300" />;
  };

  const getStatusText = (status: TaskSidebarStatus, isCompleted: boolean) => {
    if (status === "running") return "进行中";
    if (status === "interrupted") return "已中断";
    if (status === "completed" || isCompleted) return "已完成";
    if (status === "failed") return "已失败";
    return "空闲";
  };

  return (
    <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
      {items.map((item) => {
        const statusEntry = getStatusEntry(item);
        const status =
          displayedStatuses[item.taskKey] ?? (statusEntry?.status as TaskSidebarStatus);
        const executionTaskId = statusEntry?.executionTaskId;
        const isActive = executionTaskId === currentTaskId;
        return (
          <button
            key={`${item.taskKey}-${item.rawDescription}`}
            onClick={() => onTaskClick(executionTaskId)}
            disabled={!executionTaskId}
            className={`
              w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-all group
              ${
                isActive
                  ? "bg-blue-50/60 border border-blue-100"
                  : executionTaskId
                    ? "hover:bg-slate-50 border border-transparent"
                    : "opacity-80 cursor-default border border-transparent"
              }
            `}
          >
            <div className="shrink-0">{getStatusIcon(status, item.isCompleted)}</div>
            <div className="flex-1 min-w-0">
              <div
                className={`text-[12px] font-medium truncate ${isActive ? "text-blue-700" : "text-slate-700"}`}
              >
                {item.displayDescription}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                {getStatusText(status, item.isCompleted)}
              </div>
            </div>
            {executionTaskId && (
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${isActive ? "text-blue-400 translate-x-0.5" : "text-slate-300 group-hover:translate-x-0.5"}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
