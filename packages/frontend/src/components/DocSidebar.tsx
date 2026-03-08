import {
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Circle,
  Edit2,
  Eye,
  FileText,
  LayoutTemplate,
  PlayCircle,
  X,
  XCircle,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useWebSocketContext } from "../sdk/context/WebSocketContext";
import { useTasks } from "../sdk/hooks";
import type { DocType } from "../sdk/store/slices/docSlice";
import { toast } from "../utils/toast";

interface TaskListItem {
  rawDescription: string;
  normalizedDescription: string;
  displayDescription: string;
  taskKey: string;
  isCompleted: boolean;
}

interface TaskStatusMapEntry {
  status?: TaskSidebarStatus;
  subTaskId?: string;
}

type TaskSidebarStatus =
  | "running"
  | "waiting_user_input"
  | "wait_review"
  | "completed"
  | "failed"
  | undefined;

const TASK_LIST_LINE_PATTERN = /^\s*-\s+\[([ xX])\]\s+(.+)$/;
const IN_PROGRESS_SUFFIX_PATTERN = /\s*\(In Progress\)\s*$/i;
const TASK_ID_PATTERN = /\bTask\s+(\d+(?:\.\d+)*)\s*[:：]?/i;
const TASK_ID_TAG_PATTERN = /\[id:\s*([\d.]+)\s*\]/i;
const STATUS_TRANSITION_HOLD_MS = 900;

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
  const displayDescription = normalizedDescription.replace(/^\[id:\s*[\d.]+\s*\]\s*/i, "");
  const taskId = extractTaskId(rawDescription);

  return {
    rawDescription,
    normalizedDescription,
    displayDescription,
    taskKey: taskId || normalizedDescription,
    isCompleted: checkmark?.toLowerCase() === "x",
  };
};

const DocSidebar: React.FC = () => {
  const { store } = useWebSocketContext();
  const { mainTaskId, currentTaskId, switchTask, taskStatusMaps } = useTasks();
  const docState = store((state) => state.docState);
  const closeDoc = store((state) => state.closeDoc);
  const openDoc = store((state) => state.openDoc);
  const setActiveDoc = store((state) => state.setActiveDoc);
  const updateDocContent = store((state) => state.updateDocContent);

  const { isOpen, activeDoc, documents } = docState;
  // Fallback to taskList if activeDoc or documents is somehow not initialized correctly
  // This guards against potential state mismatch during hot reload or migration
  const currentDoc = documents?.[activeDoc] || documents?.taskList || { content: "", title: "" };

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [shouldRender, setShouldRender] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const hasAnyContent =
    (documents?.requirements?.content && documents.requirements.content.trim() !== "") ||
    (documents?.design?.content && documents.design.content.trim() !== "") ||
    (documents?.taskList?.content && documents.taskList.content.trim() !== "");

  const shouldShow = isOpen && hasAnyContent;

  // Handle delayed unmount for animation
  useEffect(() => {
    if (shouldShow) {
      setShouldRender(true);
    } else {
      // Delay unmount to allow animation to complete
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [shouldShow]);

  useEffect(() => {
    if (currentDoc.content) {
      setEditContent(currentDoc.content);
    } else {
      setEditContent("");
    }
  }, [currentDoc.content, activeDoc]);

  if (!shouldRender && !hasAnyContent) return null;

  const handleSave = () => {
    updateDocContent(activeDoc, editContent);
    const targetTaskId = mainTaskId || currentTaskId;
    if (!targetTaskId) {
      toast.error("当前没有可保存的任务，请先创建或加载任务");
      setIsEditing(false);
      return;
    }

    store.getState().sendMessage(targetTaskId, {
      type: "updateTaskDoc",
      data: {
        taskId: targetTaskId,
        phase: activeDoc,
        content: editContent,
      },
    });

    setIsEditing(false);
  };

  const tabs: { type: DocType; label: string; icon: React.ReactNode }[] = [
    { type: "requirements", label: "需求", icon: <FileText className="w-4 h-4" /> },
    { type: "design", label: "设计", icon: <LayoutTemplate className="w-4 h-4" /> },
    { type: "taskList", label: "任务", icon: <CheckSquare className="w-4 h-4" /> },
  ];

  return (
    <>
      {!shouldShow && hasAnyContent && (
        <button
          onClick={openDoc}
          className="fixed right-4 top-[100px] z-50 p-3 bg-white border border-gray-200 shadow-xl rounded-full text-gray-500 hover:text-blue-500 hover:border-blue-200 transition-all cursor-pointer group"
          aria-label="Open documents"
          title="打开文档栏"
        >
          <FileText className="w-5 h-5 group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* Mobile Overlay */}
      {!isDesktop && shouldRender && (
        <div
          className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-300 ${shouldShow ? "opacity-100" : "opacity-0"}`}
          onClick={closeDoc}
        />
      )}

      {shouldRender && (
        <div
          className={
            isDesktop
              ? `h-full flex flex-col border-l border-gray-200 bg-white shadow-xl z-10 transition-all duration-300 ease-in-out overflow-hidden ${shouldShow ? "w-[450px]" : "w-0"}`
              : `fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-2xl transition-transform duration-300 ease-in-out ${shouldShow ? "translate-y-0" : "translate-y-full"}`
          }
          style={!isDesktop ? { height: "85vh" } : undefined}
        >
          <div
            className={`${isDesktop ? "w-[450px]" : "w-full"} h-full flex flex-col bg-white overflow-hidden ${!isDesktop ? "rounded-t-2xl" : ""}`}
          >
            {!isDesktop && (
              <div className="w-full flex justify-center py-2.5 bg-white shrink-0">
                <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
              </div>
            )}
            <div
              className={`px-3 border-b border-gray-100 bg-white shrink-0 ${isDesktop ? "py-3" : "pb-3"}`}
            >
              <div className="flex items-center justify-between gap-1.5 p-1 bg-gray-100/50 rounded-xl border border-gray-200">
                <div className="flex items-center gap-0.5">
                  {tabs.map((tab) => (
                    <button
                      key={tab.type}
                      onClick={() => {
                        setActiveDoc(tab.type);
                        setIsEditing(false);
                      }}
                      className={`
                  flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all
                  ${
                    activeDoc === tab.type
                      ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/50"
                  }
                `}
                    >
                      <span className="shrink-0">{tab.icon}</span>
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 pr-1">
                  <button
                    onClick={() => {
                      if (isEditing) handleSave();
                      else setIsEditing(true);
                    }}
                    className="flex items-center space-x-1 text-xs font-medium text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
                  >
                    {isEditing ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">Preview</span>
                      </>
                    ) : (
                      <>
                        <Edit2 className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">Edit</span>
                      </>
                    )}
                  </button>

                  <div className="w-px h-4 bg-gray-300 mx-1" />

                  <button
                    onClick={closeDoc}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all shrink-0"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto bg-white">
              {isEditing ? (
                <textarea
                  className="w-full h-full p-4 resize-none focus:outline-none text-sm font-mono text-neutral-800 leading-relaxed"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder={`在这里输入 ${tabs.find((t) => t.type === activeDoc)?.label.toLowerCase()}...`}
                />
              ) : activeDoc === "taskList" ? (
                <div className="p-4">
                  <TaskListContent
                    content={currentDoc.content || ""}
                    statusMap={mainTaskId ? taskStatusMaps[mainTaskId] : {}}
                    currentTaskId={currentTaskId}
                    onTaskClick={(taskId) => taskId && switchTask(taskId)}
                  />
                </div>
              ) : (
                <div className="p-4 prose prose-sm max-w-none prose-neutral">
                  {currentDoc.content ? (
                    <Streamdown>{currentDoc.content}</Streamdown>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-neutral-400 space-y-2">
                      <FileText className="w-8 h-8 opacity-20" />
                      <span className="text-sm">暂无内容</span>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="text-blue-500 hover:underline text-xs"
                      >
                        开始编写
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const TaskListContent: React.FC<{
  content: string;
  statusMap: Record<string, TaskStatusMapEntry>;
  currentTaskId: string | null;
  onTaskClick: (taskId: string | undefined) => void;
}> = ({ content, statusMap, currentTaskId, onTaskClick }) => {
  const transitionTimersRef = useRef<Record<string, number>>({});
  const [displayedStatuses, setDisplayedStatuses] = useState<Record<string, TaskSidebarStatus>>({});

  const items = useMemo(() => {
    if (!content) return [];
    const lines = content.split("\n");
    return lines.map(parseTaskListLine).filter((item): item is TaskListItem => item !== null);
  }, [content]);

  const getStatusEntry = (item: TaskListItem) => {
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
          (currentStatus === "waiting_user_input" || currentStatus === "wait_review") &&
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
  }, [items, statusMap]);

  const getStatusIcon = (status: TaskSidebarStatus, isCompleted: boolean) => {
    if (status === "running") return <PlayCircle className="w-4 h-4 text-blue-500 animate-pulse" />;
    if (status === "waiting_user_input") return <Circle className="w-4 h-4 text-amber-500" />;
    if (status === "wait_review") return <Circle className="w-4 h-4 text-orange-500" />;
    if (status === "completed" || isCompleted)
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-500" />;
    return <Circle className="w-4 h-4 text-gray-300" />;
  };

  const getStatusText = (status: TaskSidebarStatus, isCompleted: boolean) => {
    if (status === "running") return "进行中";
    if (status === "waiting_user_input") return "等待用户输入";
    if (status === "wait_review") return "等待审核";
    if (status === "completed" || isCompleted) return "已完成";
    if (status === "failed") return "已失败";
    return "空闲";
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">
        任务列表
      </div>
      {items.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">暂无任务项</div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => {
            const statusEntry = getStatusEntry(item);
            const status =
              displayedStatuses[item.taskKey] ?? (statusEntry?.status as TaskSidebarStatus);
            const subTaskId = statusEntry?.subTaskId;
            const isActive = subTaskId === currentTaskId;
            return (
              <button
                key={`${item.taskKey}-${item.rawDescription}`}
                onClick={() => onTaskClick(subTaskId)}
                disabled={!subTaskId}
                className={`
                  w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all group
                  ${
                    isActive
                      ? "bg-blue-50 border border-blue-100"
                      : subTaskId
                        ? "hover:bg-gray-50 border border-transparent"
                        : "opacity-80 cursor-default border border-transparent"
                  }
                `}
              >
                <div className="shrink-0">{getStatusIcon(status, item.isCompleted)}</div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm font-medium truncate ${isActive ? "text-blue-700" : "text-gray-700"}`}
                  >
                    {item.displayDescription}
                  </div>
                  <div className="text-[10px] text-gray-400 font-medium">
                    {getStatusText(status, item.isCompleted)}
                  </div>
                </div>
                {subTaskId && (
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${isActive ? "text-blue-400 translate-x-0.5" : "text-gray-300 group-hover:translate-x-0.5"}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DocSidebar;
