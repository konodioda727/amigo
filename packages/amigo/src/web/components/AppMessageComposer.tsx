import { MessageInput, useTasks, useWebSocketContext } from "@amigo-llm/frontend";
import type { ContextUsageStatus } from "@amigo-llm/types";
import { Github, Loader2, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { cancelGithubBootstrap, type GithubBootstrapSummary } from "@/utils/githubBootstrap";
import {
  clearPendingBootstrap,
  getPendingBootstrap,
  subscribePendingBootstrap,
} from "@/utils/pendingBootstrap";
import { toast } from "@/utils/toast";
import { GithubBootstrapModal } from "./GithubBootstrapModal";

interface AppMessageComposerProps {
  taskId?: string;
}

export const AppMessageComposer: React.FC<AppMessageComposerProps> = ({ taskId }) => {
  const { config } = useWebSocketContext();
  const { mainTaskId, taskContextMaps, taskContextUsageMaps } = useTasks();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingBootstrap, setPendingBootstrapState] = useState<GithubBootstrapSummary | null>(
    () => (typeof window === "undefined" ? null : getPendingBootstrap()),
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const effectiveTaskId = taskId || mainTaskId;
  const activeTaskContext = resolveTaskContext(
    (effectiveTaskId && taskContextMaps[effectiveTaskId]) ||
      (mainTaskId ? taskContextMaps[mainTaskId] : undefined),
  );
  const currentTaskContextUsage =
    (effectiveTaskId && taskContextUsageMaps[effectiveTaskId]) ||
    (mainTaskId ? taskContextUsageMaps[mainTaskId] : undefined);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    return subscribePendingBootstrap(() => {
      setPendingBootstrapState(getPendingBootstrap());
    });
  }, []);

  const handleCancelBootstrap = async () => {
    if (!pendingBootstrap) {
      return;
    }

    setIsCancelling(true);
    try {
      await cancelGithubBootstrap(config.url, {
        repoUrl: pendingBootstrap.repoUrl,
        branch: pendingBootstrap.branch,
      });
      clearPendingBootstrap();
      toast.success("已取消当前仓库预热");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="w-full">
      <MessageInput
        taskId={taskId}
        createTaskContext={!effectiveTaskId && pendingBootstrap ? pendingBootstrap : undefined}
        onSend={() => {
          if (!effectiveTaskId && pendingBootstrap) {
            clearPendingBootstrap();
          }
        }}
        bottomAccessory={
          <div className="flex w-full items-center justify-between gap-3">
            <div className="min-w-0">
              {effectiveTaskId ? (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50/90 px-2.5 py-1 text-[13px] text-gray-400 cursor-not-allowed"
                  title={
                    activeTaskContext?.repoUrl
                      ? `${activeTaskContext.repoUrl}${activeTaskContext.branch ? ` · ${activeTaskContext.branch}` : ""}`
                      : "当前会话未绑定 GitHub 仓库"
                  }
                >
                  <Github className="h-3.5 w-3.5" />
                  <span className="max-w-[320px] truncate">
                    {activeTaskContext?.repoLabel || "未绑定 GitHub 仓库"}
                  </span>
                </button>
              ) : pendingBootstrap ? (
                <div className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-gray-500 transition-colors hover:bg-gray-100/80 hover:text-gray-800">
                  <Github className="h-3.5 w-3.5" />
                  <span className="max-w-[300px] truncate" title={pendingBootstrap.repoUrl}>
                    {pendingBootstrap.repoUrl
                      .replace("https://github.com/", "")
                      .replace(".git", "")}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCancelBootstrap()}
                    disabled={isCancelling}
                    className="ml-0.5 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50"
                    title="取消当前仓库"
                  >
                    {isCancelling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-gray-400 transition-colors hover:bg-gray-100/80 hover:text-gray-800"
                >
                  <Github className="h-3.5 w-3.5" />
                  <span>添加 GitHub 仓库</span>
                </button>
              )}
            </div>
            {currentTaskContextUsage && <ContextUsageRing contextUsage={currentTaskContextUsage} />}
          </div>
        }
      />

      <GithubBootstrapModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};

interface TaskGithubContext {
  repoUrl: string;
  repoName?: string;
  branch?: string;
  defaultBranch?: string;
  commitSha?: string;
  updatedAt?: string;
  repoLabel: string;
}

const resolveTaskContext = (context: any): TaskGithubContext | null => {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return null;
  }

  const repoUrl = typeof context.repoUrl === "string" ? context.repoUrl.trim() : "";
  if (!repoUrl) {
    return null;
  }

  const repoName = typeof context.repoName === "string" ? context.repoName.trim() : "";
  const branch = typeof context.branch === "string" ? context.branch.trim() : "";
  const repoPath = repoUrl.replace("https://github.com/", "").replace(".git", "");

  return {
    repoUrl,
    repoName: repoName || undefined,
    branch: branch || undefined,
    defaultBranch:
      typeof context.defaultBranch === "string"
        ? context.defaultBranch.trim() || undefined
        : undefined,
    commitSha:
      typeof context.commitSha === "string" ? context.commitSha.trim() || undefined : undefined,
    updatedAt:
      typeof context.updatedAt === "string" ? context.updatedAt.trim() || undefined : undefined,
    repoLabel: branch ? `${repoName || repoPath} · ${branch}` : repoName || repoPath,
  };
};

const ContextUsageRing: React.FC<{ contextUsage: ContextUsageStatus }> = ({ contextUsage }) => {
  const usageRatio = Math.max(0, Math.min(contextUsage.usageRatio || 0, 1));
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - usageRatio);
  const stroke = contextUsage.isCompressing
    ? "#2563eb"
    : usageRatio >= contextUsage.compressionThreshold
      ? "#d97706"
      : "#6b7280";
  const strokeWidth = 3;
  const title = `上下文占用 ${Math.round(usageRatio * 100)}% (${contextUsage.estimatedTokens.toLocaleString(
    "zh-CN",
  )} / ${contextUsage.contextWindow.toLocaleString("zh-CN")} tokens)`;

  return (
    <div
      className="flex h-6 w-6 shrink-0 items-center justify-center"
      role="img"
      aria-label={title}
      title={title}
    >
      <svg viewBox="0 0 24 24" className="-rotate-90">
        <title>{title}</title>
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="rgba(156, 163, 175, 0.2)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
    </div>
  );
};
