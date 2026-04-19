import { MessageInput, useTasks, useWebSocketContext } from "@amigo-llm/frontend";
import type { ContextUsageStatus } from "@amigo-llm/types";
import { AlertCircle, ChevronDown, Github, Loader2, X } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { cancelGithubBootstrap, type GithubBootstrapSummary } from "@/utils/githubBootstrap";
import {
  clearNewConversationDraft,
  getNewConversationDraft,
  setNewConversationDraft,
} from "@/utils/newConversationDraft";
import {
  clearPendingBootstrap,
  getPendingBootstrap,
  subscribePendingBootstrap,
} from "@/utils/pendingBootstrap";
import {
  clearPendingConversationLaunch,
  getPendingConversationLaunch,
  setPendingConversationLaunch,
} from "@/utils/pendingConversationLaunch";
import {
  flattenModelConfigs,
  getUserModelConfigs,
  listSkills,
  type ResolvedModelOption,
  type SkillSummary,
  type UserModelConfigSettings,
} from "@/utils/serverAdmin";
import { openSettingsModal, subscribeSettingsUpdated } from "@/utils/settingsModal";
import { toast } from "@/utils/toast";
import { GithubBootstrapModal } from "./GithubBootstrapModal";
import { TaskListDropdown } from "./TaskListDropdown";

interface AppMessageComposerProps {
  taskId?: string;
}

export const canSwitchTaskModel = (
  taskId: string | null | undefined,
  taskStatus: string,
): boolean => !taskId || taskStatus !== "streaming";

export const getTaskModelKey = (context: unknown): string => {
  const taskModel = resolveTaskModelContext(context);
  return taskModel?.model && taskModel.modelConfigId
    ? `${taskModel.modelConfigId}::${taskModel.model}`
    : "";
};

export const AppMessageComposer: React.FC<AppMessageComposerProps> = ({ taskId }) => {
  const { config } = useWebSocketContext();
  const { mainTaskId, taskContextMaps, taskContextUsageMaps, taskStatusMaps, tasks } = useTasks();
  const initialDraft = getNewConversationDraft();
  const initialPendingLaunch = getPendingConversationLaunch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingBootstrap, setPendingBootstrapState] = useState<GithubBootstrapSummary | null>(
    () => (typeof window === "undefined" ? null : getPendingBootstrap()),
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillSummary[]>([]);
  const [modelSettings, setModelSettings] = useState<UserModelConfigSettings | null>(null);
  const [selectedModelKey, setSelectedModelKey] = useState(
    initialDraft.selectedModelKey || initialPendingLaunch?.selectedModelKey || "",
  );
  const effectiveTaskId = taskId || mainTaskId;
  const [pendingConversationLaunch, setPendingConversationLaunchState] =
    useState(initialPendingLaunch);
  const rawTaskContext =
    (effectiveTaskId && taskContextMaps[effectiveTaskId]) ||
    (mainTaskId ? taskContextMaps[mainTaskId] : undefined);
  const activeTaskContext = useMemo(() => resolveTaskContext(rawTaskContext), [rawTaskContext]);
  const activeTaskModelKey = useMemo(() => getTaskModelKey(rawTaskContext), [rawTaskContext]);
  const activeSkillIds = extractSkillIds(rawTaskContext);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>(
    initialDraft.selectedSkillIds.length > 0
      ? initialDraft.selectedSkillIds
      : initialPendingLaunch?.selectedSkillIds || [],
  );
  const currentTaskContextUsage =
    (effectiveTaskId && taskContextUsageMaps[effectiveTaskId]) ||
    (mainTaskId ? taskContextUsageMaps[mainTaskId] : undefined);
  const hasActiveTaskStatusSnapshot = Boolean(effectiveTaskId && taskStatusMaps[effectiveTaskId]);
  const pendingLaunchMatchesActiveTask = Boolean(
    pendingConversationLaunch &&
      effectiveTaskId &&
      (!pendingConversationLaunch.taskId || pendingConversationLaunch.taskId === effectiveTaskId),
  );
  const pendingLaunchTaskContext = useMemo(
    () => resolvePendingLaunchTaskContext(pendingConversationLaunch),
    [pendingConversationLaunch],
  );
  const displayTaskContext =
    activeTaskContext ||
    (pendingLaunchMatchesActiveTask && !hasActiveTaskStatusSnapshot
      ? pendingLaunchTaskContext
      : null);
  const displaySkillIds =
    effectiveTaskId &&
    activeSkillIds.length === 0 &&
    pendingLaunchMatchesActiveTask &&
    !hasActiveTaskStatusSnapshot
      ? pendingConversationLaunch?.selectedSkillIds || []
      : activeSkillIds;
  const currentTaskStatus = (effectiveTaskId && tasks[effectiveTaskId]?.status) || "idle";
  const canSwitchModel = canSwitchTaskModel(effectiveTaskId, currentTaskStatus);
  const availableModels = useMemo(
    () =>
      modelSettings
        ? flattenModelConfigs(modelSettings.modelConfigs).filter((item) => {
            const config = modelSettings.modelConfigs[item.configId];
            return !!(config?.hasApiKey || config?.apiKey.trim());
          })
        : [],
    [modelSettings],
  );
  const duplicateModelNames = useMemo(() => {
    const counts = new Map<string, number>();
    availableModels.forEach((item) => {
      counts.set(item.model, (counts.get(item.model) || 0) + 1);
    });
    return counts;
  }, [availableModels]);
  const selectedModel = useMemo(
    () => availableModels.find((item) => getModelOptionKey(item) === selectedModelKey) || null,
    [availableModels, selectedModelKey],
  );
  const selectedModelLabel = useMemo(
    () =>
      selectedModel
        ? getModelOptionLabel(selectedModel, duplicateModelNames)
        : getModelLabelFromKey(selectedModelKey),
    [duplicateModelNames, selectedModel, selectedModelKey],
  );
  const defaultModelKey = useMemo(
    () => getModelSelectionKey(modelSettings?.defaultModel || null),
    [modelSettings?.defaultModel],
  );

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

    const loadModelSettings = async () => {
      try {
        const settings = await getUserModelConfigs(config.url);
        if (!cancelled) {
          setModelSettings(settings);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[AppMessageComposer] 加载模型配置失败", error);
        }
      }
    };

    void Promise.all([loadSkills(), loadModelSettings()]);
    const unsubscribe = subscribeSettingsUpdated(() => {
      void loadModelSettings();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [config.url]);

  useEffect(() => {
    if (!effectiveTaskId || !pendingConversationLaunch || pendingConversationLaunch.taskId) {
      return;
    }

    const nextLaunch = {
      ...pendingConversationLaunch,
      taskId: effectiveTaskId,
    };
    setPendingConversationLaunch(nextLaunch);
    setPendingConversationLaunchState(nextLaunch);
  }, [effectiveTaskId, pendingConversationLaunch]);

  useEffect(() => {
    if (!effectiveTaskId || !pendingLaunchMatchesActiveTask || !hasActiveTaskStatusSnapshot) {
      return;
    }

    clearPendingConversationLaunch();
    setPendingConversationLaunchState(null);
    clearNewConversationDraft();
    clearPendingBootstrap();
  }, [effectiveTaskId, hasActiveTaskStatusSnapshot, pendingLaunchMatchesActiveTask]);

  useEffect(() => {
    const nextKey = resolveComposerModelKey({
      effectiveTaskId,
      availableModels,
      defaultModelKey,
      activeTaskModelKey,
      currentSelectedModelKey: selectedModelKey,
    });
    setSelectedModelKey((currentKey) => (currentKey === nextKey ? currentKey : nextKey));
  }, [activeTaskModelKey, availableModels, defaultModelKey, effectiveTaskId, selectedModelKey]);

  useEffect(() => {
    if (effectiveTaskId) {
      return;
    }

    setNewConversationDraft({
      selectedModelKey,
      selectedSkillIds,
    });
  }, [effectiveTaskId, selectedModelKey, selectedSkillIds]);

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
    !effectiveTaskId && (pendingBootstrap || selectedSkillIds.length > 0 || selectedModel)
      ? {
          ...(pendingBootstrap || {}),
          ...(selectedSkillIds.length > 0 ? { skillIds: selectedSkillIds } : {}),
          ...(selectedModel
            ? {
                model: selectedModel.model,
                modelConfigId: selectedModel.configId,
              }
            : {}),
        }
      : undefined;

  return (
    <div className="w-full">
      <MessageInput
        taskId={taskId}
        topAccessory={<TaskListDropdown />}
        createTaskContext={createTaskContext}
        modelConfigSnapshot={
          canSwitchModel && selectedModel
            ? {
                configId: selectedModel.configId,
                model: selectedModel.model,
              }
            : undefined
        }
        onSend={() => {
          if (!effectiveTaskId) {
            const nextPendingLaunch = {
              selectedModelKey,
              selectedSkillIds,
              pendingBootstrap,
            };
            setPendingConversationLaunch(nextPendingLaunch);
            setPendingConversationLaunchState(nextPendingLaunch);
          }
        }}
        bottomAccessory={
          <>
            {availableModels.length > 0 ? (
              <label className="relative flex shrink-0 items-center justify-center bg-transparent hover:bg-black/[0.04] rounded-lg px-2 py-1.5 transition-colors cursor-pointer group">
                <span className="text-[12px] font-medium text-gray-700 mr-1 max-w-[150px] sm:max-w-[200px] truncate pr-1">
                  {selectedModelLabel}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600" />
                <select
                  value={selectedModelKey}
                  onChange={(event) => setSelectedModelKey(event.target.value)}
                  disabled={!canSwitchModel}
                  className="absolute inset-0 opacity-0 w-full h-full disabled:cursor-not-allowed cursor-pointer"
                  title={
                    selectedModel
                      ? `${selectedModel.model} · ${selectedModel.configId}`
                      : selectedModelLabel
                  }
                >
                  {availableModels.map((item) => (
                    <option
                      key={getModelOptionKey(item)}
                      value={getModelOptionKey(item)}
                      className="text-black"
                    >
                      {getModelOptionLabel(item, duplicateModelNames)}
                    </option>
                  ))}
                </select>
              </label>
            ) : selectedModelKey ? (
              <div className="flex shrink-0 items-center justify-center rounded-lg px-2 py-1.5 text-[12px] font-medium text-gray-700">
                {selectedModelLabel}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openSettingsModal()}
                className="flex shrink-0 items-center justify-center gap-1.5 bg-transparent hover:bg-orange-50 rounded-lg px-2 py-1.5 text-[12px] font-medium text-orange-600 transition-colors"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                <span>请先配置模型</span>
              </button>
            )}

            {effectiveTaskId ? (
              <button
                type="button"
                disabled
                className="flex shrink-0 items-center gap-1.5 bg-transparent rounded-lg px-2 py-1.5 text-[12px] font-medium text-gray-400 disabled:cursor-not-allowed"
                title={
                  displayTaskContext?.repoUrl
                    ? `${displayTaskContext.repoUrl}${
                        displayTaskContext.branch ? ` · ${displayTaskContext.branch}` : ""
                      }`
                    : "当前会话未绑定 GitHub 仓库"
                }
              >
                <Github className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[150px] truncate">
                  {displayTaskContext?.repoLabel || "未绑定 GitHub 仓库"}
                </span>
              </button>
            ) : pendingBootstrap ? (
              <div className="flex shrink-0 items-center gap-1.5 bg-transparent rounded-lg px-2 py-1.5 text-[12px] font-medium text-gray-600">
                <Github className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="max-w-[150px] truncate" title={pendingBootstrap.repoUrl}>
                  {pendingBootstrap.repoUrl.replace("https://github.com/", "").replace(".git", "")}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCancelBootstrap()}
                  disabled={isCancelling}
                  className="flex h-3.5 w-3.5 items-center justify-center text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="flex shrink-0 items-center gap-1.5 bg-transparent hover:bg-black/[0.04] rounded-lg px-2 py-1.5 text-[12px] font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                <Github className="h-3.5 w-3.5 shrink-0" />
                <span>远程仓库</span>
              </button>
            )}

            {!effectiveTaskId &&
              availableSkills.length > 0 &&
              availableSkills.map((skill) => {
                const isSelected = selectedSkillIds.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() =>
                      setSelectedSkillIds((prev) =>
                        isSelected ? prev.filter((item) => item !== skill.id) : [...prev, skill.id],
                      )
                    }
                    className={`flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                      isSelected
                        ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                        : "bg-transparent text-gray-600 hover:bg-black/[0.04]"
                    }`}
                    title={skill.description || skill.name}
                  >
                    {skill.name}
                  </button>
                );
              })}

            {effectiveTaskId &&
              displaySkillIds.length > 0 &&
              displaySkillIds.map((skillId) => {
                const skillName =
                  availableSkills.find((skill) => skill.id === skillId)?.name || skillId;
                return (
                  <span
                    key={skillId}
                    className="flex shrink-0 items-center justify-center rounded-lg bg-blue-100 px-2.5 py-1.5 text-[12px] font-medium text-blue-700"
                  >
                    {skillName}
                  </span>
                );
              })}

            <div className="flex shrink-0 items-center gap-2 ml-auto">
              {currentTaskContextUsage && (
                <ContextUsageRing contextUsage={currentTaskContextUsage} />
              )}
            </div>
          </>
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

interface TaskModelContext {
  model?: string;
  modelConfigId?: string;
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

const resolveTaskModelContext = (context: unknown): TaskModelContext | null => {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return null;
  }

  const model =
    typeof (context as { model?: unknown }).model === "string"
      ? String((context as { model?: string }).model).trim()
      : "";
  const modelConfigId =
    typeof (context as { modelConfigId?: unknown }).modelConfigId === "string"
      ? String((context as { modelConfigId?: string }).modelConfigId).trim()
      : "";

  if (!model) {
    return null;
  }

  return {
    model,
    ...(modelConfigId ? { modelConfigId } : {}),
  };
};

const getModelOptionKey = (option: Pick<ResolvedModelOption, "configId" | "model">): string =>
  `${option.configId}::${option.model}`;

const getModelSelectionKey = (
  selection: { configId?: string | null; model?: string | null } | null | undefined,
): string => {
  const configId = typeof selection?.configId === "string" ? selection.configId.trim() : "";
  const model = typeof selection?.model === "string" ? selection.model.trim() : "";
  return configId && model ? `${configId}::${model}` : "";
};

const getModelOptionLabel = (
  option: Pick<ResolvedModelOption, "configId" | "model">,
  duplicateModelNames: Map<string, number>,
): string => {
  return (duplicateModelNames.get(option.model) || 0) > 1
    ? `${option.model} · ${option.configId}`
    : option.model;
};

export const resolveComposerModelKey = (params: {
  effectiveTaskId?: string | null;
  availableModels: ResolvedModelOption[];
  defaultModelKey: string;
  activeTaskModelKey: string;
  currentSelectedModelKey: string;
}): string => {
  const hasModel = (key: string): boolean =>
    !!key && params.availableModels.some((item) => getModelOptionKey(item) === key);

  if (params.availableModels.length === 0) {
    if (params.effectiveTaskId && params.activeTaskModelKey) {
      return params.activeTaskModelKey;
    }

    return params.currentSelectedModelKey || params.defaultModelKey;
  }

  if (params.effectiveTaskId && hasModel(params.activeTaskModelKey)) {
    return params.activeTaskModelKey;
  }

  if (hasModel(params.currentSelectedModelKey)) {
    return params.currentSelectedModelKey;
  }

  if (
    params.defaultModelKey &&
    params.availableModels.some((item) => getModelOptionKey(item) === params.defaultModelKey)
  ) {
    return params.defaultModelKey;
  }

  return params.availableModels[0] ? getModelOptionKey(params.availableModels[0]) : "";
};

const getModelLabelFromKey = (modelKey: string): string => {
  if (!modelKey) {
    return "选择模型";
  }

  const [, model] = modelKey.split("::");
  return model || "选择模型";
};

const resolvePendingLaunchTaskContext = (
  pendingLaunch: {
    pendingBootstrap: GithubBootstrapSummary | null;
  } | null,
): TaskGithubContext | null => {
  if (!pendingLaunch?.pendingBootstrap) {
    return null;
  }

  return resolveTaskContext(pendingLaunch.pendingBootstrap);
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
      : "#9ca3af";
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
