import React, { useEffect, useState, useRef } from "react";
import type { ToolRendererProps } from ".";
import { useWebSocket } from "@/components/WebSocketProvider";

const AssignTask: React.FC<ToolRendererProps<"assignTasks">> = (props) => {
  const { params, toolOutput, error, updateTime } = props;
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [modalIdx, setModalIdx] = useState<number | null>(null);
  const { subscribe } = useWebSocket();

  // 独立消息流
  const [subTaskMessages, setSubTaskMessages] = useState<Record<string, any[]>>({});
  const listenersRef = useRef<Record<string, () => void>>({});

  useEffect(() => {
    // 监听 assignTaskUpdated，按 index 补全对应 taskId
    const unsubscribe = subscribe("assignTaskUpdated", (data) => {
      if (
        typeof data?.taskId === "string" &&
        typeof data?.index === "number"
      ) {
        setTaskIds((prev) => {
          const next = [...prev];
          next[data.index] = data.taskId;
          return next;
        });
      }
    });
    return unsubscribe;
  }, [subscribe]);

  useEffect(() => {
    Object.values(listenersRef.current).forEach(unsub => { if (unsub) unsub(); });
    listenersRef.current = {};

    taskIds.forEach((taskId, idx) => {
      if (taskId) {
        const unsub = subscribe("tool", (data: any) => {
          if (data && data.taskId === taskId) {
            setSubTaskMessages(prev => ({
              ...prev,
              [taskId]: [...(prev[taskId] || []), data]
            }));
          }
        });
        listenersRef.current[taskId] = unsub;
      }
    });

    return () => {
      Object.values(listenersRef.current).forEach(unsub => { if (unsub) unsub(); });
      listenersRef.current = {};
    };
  }, [taskIds, subscribe]);

  const tasklist = params.tasklist || [];

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full max-w-2xl">
        <div className="font-bold text-lg mb-4 text-primary">分配任务工具</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.isArray(tasklist) &&
            tasklist.map((item, idx) => (
              <div
                key={taskIds[idx] ?? `${idx}`}
                className="card bg-base-100 shadow-xl border border-base-200 hover:border-primary transition-all"
              >
                <div className="card-body p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-base font-semibold text-primary">#{idx}</span>
                    <span
                      className={`badge ${taskIds[idx] ? "badge-success" : "badge-warning"} badge-outline`}
                    >
                      {taskIds[idx] ? `已分配: ${taskIds[idx]}` : "未分配"}
                    </span>
                  </div>
                  <div className="mb-2">
                    <span className="font-bold text-accent">目标：</span>
                    <span className="ml-2">{item.target}</span>
                  </div>
                  <div className="mb-2">
                    <span className="font-bold text-accent">子代理提示：</span>
                    <span className="ml-2">{item.subAgentPrompt}</span>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="font-bold text-accent">工具：</span>
                    {item.tools?.map((tool, i) => (
                      <span key={tool} className="badge badge-info badge-outline">
                        {tool}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary mt-2 w-full"
                    onClick={() => setModalIdx(idx)}
                  >
                    查看子任务详情
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
      {modalIdx !== null && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          onClick={() => setModalIdx(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setModalIdx(null);
          }}
        >
          <div
            className="bg-base-100 rounded-2xl shadow-2xl p-8 min-w-[340px] max-w-[95vw] border-2 border-primary flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
            role="document"
            onKeyDown={(e) => {
              if (e.key === "Escape") setModalIdx(null);
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-xl text-primary">子任务 #{modalIdx} 详情</div>
              <span
                className={`badge ${taskIds[modalIdx] ? "badge-success" : "badge-warning"} badge-outline`}
              >
                {taskIds[modalIdx] ? `已分配: ${taskIds[modalIdx]}` : "未分配"}
              </span>
            </div>
            <div className="divider my-2"></div>
            <div className="mb-2 text-base flex flex-col gap-2">
              <div>
                <span className="font-bold text-accent">目标：</span>
                <span className="ml-2">{tasklist[modalIdx]?.target}</span>
              </div>
              <div>
                <span className="font-bold text-accent">子代理提示：</span>
                <span className="ml-2">{tasklist[modalIdx]?.subAgentPrompt}</span>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-bold text-accent">工具：</span>
                {tasklist[modalIdx]?.tools?.map((tool) => (
                  <span key={tool} className="badge badge-info badge-outline">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
            <div className="divider my-2"></div>
            <div className="mb-2 text-base">
              <span className="font-bold text-accent">相关消息：</span>
              <ul className="max-h-60 overflow-y-auto mt-1">
                {taskIds[modalIdx] && subTaskMessages[taskIds[modalIdx]] ? (
                  subTaskMessages[taskIds[modalIdx]].map((m, i) => (
                    <li key={m?.id || m?.messageId || m?.taskId || i} className="mb-1">
                      <pre className="bg-base-200 rounded p-2 text-xs">
                        {JSON.stringify(m, null, 2)}
                      </pre>
                    </li>
                  ))
                ) : (
                  <li className="text-gray-400">暂无相关消息</li>
                )}
              </ul>
            </div>
            <button
              className="btn btn-primary mt-2 w-full"
              type="button"
              onClick={() => setModalIdx(null)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
      {toolOutput && (
        <div className="mt-4 text-success font-bold text-base">
          <strong>输出:</strong> {JSON.stringify(toolOutput)}
        </div>
      )}
      {error && (
        <div className="mt-4 text-error font-bold text-base">
          <strong>错误:</strong> {error}
        </div>
      )}
      <div className="text-xs opacity-50 mt-2">
        {updateTime && new Date(updateTime).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default AssignTask;
