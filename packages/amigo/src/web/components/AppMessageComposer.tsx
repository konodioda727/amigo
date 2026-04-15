import { MessageInput, useTasks, useWebSocketContext } from "@amigo-llm/frontend";
import type { ContextUsageStatus, WorkflowMode, WorkflowState } from "@amigo-llm/types";
import { AlertCircle, ChevronDown, Github, Loader2, X, Zap } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { cancelGithubBootstrap, type GithubBootstrapSummary } from "@/utils/githubBootstrap";
import {
  clearPendingBootstrap,
  getPendingBootstrap,
  subscribePendingBootstrap,
} from "@/utils/pendingBootstrap";
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

export const getTaskWorkflowMode = (
  workflowState: WorkflowState | null | undefined,
): WorkflowMode => (workflowState?.mode === "fast" ? "fast" : "phased");

export const AppMessageComposer: React.FC<AppMessageComposerProps> = ({ taskId }) => {
  const { config } = useWebSocketContext();
  const { mainTaskId, taskContextMaps, taskContextUsageMaps, taskWorkflowStateMaps, tasks } =
    useTasks();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingBootstrap, setPendingBootstrapState] = useState<GithubBootstrapSummary | null>(
    () => (typeof window === "undefined" ? null : getPendingBootstrap()),
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillSummary[]>([]);
  const [modelSettings, setModelSettings] = useState<UserModelConfigSettings | null>(null);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [selectedWorkflowMode, setSelectedWorkflowMode] = useState<WorkflowMode>("fast");
  const effectiveTaskId = taskId || mainTaskId;
  const rawTaskContext =
    (effectiveTaskId && taskContextMaps[effectiveTaskId]) ||
    (mainTaskId ? taskContextMaps[mainTaskId] : undefined);
  const activeTaskContext = useMemo(() => resolveTaskContext(rawTaskContext), [rawTaskContext]);
  const activeTaskModelKey = useMemo(() => getTaskModelKey(rawTaskContext), [rawTaskContext]);
  const activeWorkflowMode = useMemo(
    () =>
      getTaskWorkflowMode(
        (effectiveTaskId && taskWorkflowStateMaps[effectiveTaskId]) ||
          (mainTaskId ? taskWorkflowStateMaps[mainTaskId] : undefined),
      ),
    [effectiveTaskId, mainTaskId, taskWorkflowStateMaps],
  );
  const activeSkillIds = extractSkillIds(rawTaskContext);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const currentTaskContextUsage =
    (effectiveTaskId && taskContextUsageMaps[effectiveTaskId]) ||
    (mainTaskId ? taskContextUsageMaps[mainTaskId] : undefined);
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
    const nextKey = resolveInitialModelKey({
      availableModels,
      defaultModelKey,
      activeTaskModelKey,
    });
    if (!nextKey) {
      return;
    }

    setSelectedModelKey((currentKey) => (currentKey === nextKey ? currentKey : nextKey));
  }, [activeTaskModelKey, availableModels, defaultModelKey]);

  useEffect(() => {
    if (!effectiveTaskId) {
      setSelectedWorkflowMode((currentMode) => (currentMode === "fast" ? currentMode : "fast"));
      return;
    }

    setSelectedWorkflowMode((currentMode) =>
      currentMode === activeWorkflowMode ? currentMode : activeWorkflowMode,
    );
  }, [activeWorkflowMode, effectiveTaskId]);

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
        workflowMode={selectedWorkflowMode}
        onSend={() => {
          if (!effectiveTaskId && pendingBootstrap) {
            clearPendingBootstrap();
          }
          if (!effectiveTaskId) {
            setSelectedSkillIds([]);
          }
        }}
        bottomAccessory={
          <>
            <WorkflowModeSwitch
              mode={selectedWorkflowMode}
              onChange={(nextMode) => setSelectedWorkflowMode(nextMode)}
            />

            {availableModels.length > 0 ? (
              <label className="relative flex shrink-0 items-center justify-center bg-transparent hover:bg-black/[0.04] rounded-lg px-2 py-1.5 transition-colors cursor-pointer group">
                <span className="text-[12px] font-medium text-gray-700 mr-1 max-w-[150px] sm:max-w-[200px] truncate pr-1">
                  {selectedModel
                    ? getModelOptionLabel(selectedModel, duplicateModelNames)
                    : "选择模型"}
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
                      : "选择模型"
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
                  activeTaskContext?.repoUrl
                    ? `${activeTaskContext.repoUrl}${
                        activeTaskContext.branch ? ` · ${activeTaskContext.branch}` : ""
                      }`
                    : "当前会话未绑定 GitHub 仓库"
                }
              >
                <Github className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[150px] truncate">
                  {activeTaskContext?.repoLabel || "未绑定 GitHub 仓库"}
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
                <span>IDE 背景信息</span>
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
              activeSkillIds.length > 0 &&
              activeSkillIds.map((skillId) => {
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

const resolveInitialModelKey = (params: {
  availableModels: ResolvedModelOption[];
  defaultModelKey: string;
  activeTaskModelKey: string;
}): string => {
  if (
    params.activeTaskModelKey &&
    params.availableModels.some((item) => getModelOptionKey(item) === params.activeTaskModelKey)
  ) {
    return params.activeTaskModelKey;
  }

  if (
    params.defaultModelKey &&
    params.availableModels.some((item) => getModelOptionKey(item) === params.defaultModelKey)
  ) {
    return params.defaultModelKey;
  }

  return params.availableModels[0] ? getModelOptionKey(params.availableModels[0]) : "";
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

const WorkflowModeSwitch: React.FC<{
  mode: WorkflowMode;
  onChange: (mode: WorkflowMode) => void;
}> = ({ mode, onChange }) => {
  const isWorkflow = mode === "phased";

  return (
    <button
      type="button"
      title={isWorkflow ? "当前为工作流模式" : "切换到工作流模式"}
      onClick={() => onChange(isWorkflow ? "fast" : "phased")}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${
        isWorkflow
          ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
          : "bg-transparent text-gray-600 hover:bg-black/[0.04]"
      }`}
    >
      <Zap className="h-3.5 w-3.5" />
      <span>工作流模式</span>
    </button>
  );
};
