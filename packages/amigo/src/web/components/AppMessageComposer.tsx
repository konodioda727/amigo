import { MessageInput, useTasks, useWebSocketContext } from "@amigo-llm/frontend";
import type { ContextUsageStatus } from "@amigo-llm/types";
import { Bot, Github, Loader2, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { cancelGithubBootstrap, type GithubBootstrapSummary } from "@/utils/githubBootstrap";
import {
  clearPendingBootstrap,
  getPendingBootstrap,
  subscribePendingBootstrap,
} from "@/utils/pendingBootstrap";
import { listSkills, type SkillSummary } from "@/utils/serverAdmin";
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
  const [availableSkills, setAvailableSkills] = useState<SkillSummary[]>([]);
  const effectiveTaskId = taskId || mainTaskId;
  const rawTaskContext =
    (effectiveTaskId && taskContextMaps[effectiveTaskId]) ||
    (mainTaskId ? taskContextMaps[mainTaskId] : undefined);
  const activeTaskContext = resolveTaskContext(rawTaskContext);
  const activeSkillIds = extractSkillIds(rawTaskContext);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
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

  useEffect(() => {
    let cancelled = false;

    const loadSkills = async () => {
      try {
        const skills = await listSkills(config.url);
        if (!cancelled) {
          setAvailableSkills(skills);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[AppMessageComposer] 加载 skills 失败", error);
        }
      }
    };

    void loadSkills();
    return () => {
      cancelled = true;
    };
  }, [config.url]);

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

  const createTaskContext =
    !effectiveTaskId && (pendingBootstrap || selectedSkillIds.length > 0)
      ? {
          ...(pendingBootstrap || {}),
          ...(selectedSkillIds.length > 0 ? { skillIds: selectedSkillIds } : {}),
        }
      : undefined;

  return (
    <div className="w-full">
      <MessageInput
        taskId={taskId}
        createTaskContext={createTaskContext}
        onSend={() => {
          if (!effectiveTaskId && pendingBootstrap) {
            clearPendingBootstrap();
          }
          if (!effectiveTaskId) {
            setSelectedSkillIds([]);
          }
        }}
        bottomAccessory={
          <div className="flex w-full flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-2">
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

              {!effectiveTaskId && availableSkills.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[12px] text-gray-400">
                    <Bot className="h-3.5 w-3.5" />
                    Skills
                  </span>
                  {availableSkills.map((skill) => {
                    const isSelected = selectedSkillIds.includes(skill.id);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() =>
                          setSelectedSkillIds((prev) =>
                            isSelected
                              ? prev.filter((item) => item !== skill.id)
                              : [...prev, skill.id],
                          )
                        }
                        className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                          isSelected
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                        }`}
                        title={skill.description || skill.name}
                      >
                        {skill.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {effectiveTaskId && activeSkillIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[12px] text-gray-400">
                    <Bot className="h-3.5 w-3.5" />
                    当前 Skills
                  </span>
                  {activeSkillIds.map((skillId) => {
                    const skillName =
                      availableSkills.find((skill) => skill.id === skillId)?.name || skillId;
                    return (
                      <span
                        key={skillId}
                        className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[12px] text-blue-700"
                      >
                        {skillName}
                      </span>
                    );
                  })}
                </div>
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

const resolveTaskContext = (context: unknown): TaskGithubContext | null => {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return null;
  }

  const taskContext = context as Record<string, unknown>;
  const repoUrl = typeof taskContext.repoUrl === "string" ? taskContext.repoUrl.trim() : "";
  if (!repoUrl) {
    return null;
  }

  const repoName = typeof taskContext.repoName === "string" ? taskContext.repoName.trim() : "";
  const branch = typeof taskContext.branch === "string" ? taskContext.branch.trim() : "";
  const repoPath = repoUrl.replace("https://github.com/", "").replace(".git", "");

  return {
    repoUrl,
    repoName: repoName || undefined,
    branch: branch || undefined,
    defaultBranch:
      typeof taskContext.defaultBranch === "string"
        ? taskContext.defaultBranch.trim() || undefined
        : undefined,
    commitSha:
      typeof taskContext.commitSha === "string"
        ? taskContext.commitSha.trim() || undefined
        : undefined,
    updatedAt:
      typeof taskContext.updatedAt === "string"
        ? taskContext.updatedAt.trim() || undefined
        : undefined,
    repoLabel: branch ? `${repoName || repoPath} · ${branch}` : repoName || repoPath,
  };
};

const extractSkillIds = (context: unknown): string[] => {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return [];
  }

  const rawSkillIds = (context as { skillIds?: unknown; skillId?: unknown }).skillIds;
  if (Array.isArray(rawSkillIds)) {
    return Array.from(
      new Set(rawSkillIds.map((value) => String(value || "").trim()).filter(Boolean)),
    );
  }

  const rawSkillId = (context as { skillId?: unknown }).skillId;
  if (typeof rawSkillId === "string" && rawSkillId.trim()) {
    return [rawSkillId.trim()];
  }

  return [];
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
