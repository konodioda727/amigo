import { useWebSocketContext } from "@amigo-llm/frontend";
import {
  Bot,
  Check,
  ChevronRight,
  KeyRound,
  Loader2,
  Plus,
  Save,
  Server,
  Trash2,
  X,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  flattenModelConfigs,
  getUserModelConfigs,
  type ModelConfig,
  type ModelSelection,
  type ProviderModelConfig,
  upsertUserModelConfigs,
} from "@/utils/serverAdmin";
import { toast } from "@/utils/toast";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type EditableProviderModelConfig = ProviderModelConfig & {
  uiId: string;
};

type EditableModelConfig = Omit<ModelConfig, "models"> & {
  models: EditableProviderModelConfig[];
};

type EditableSettings = {
  modelConfigs: Record<string, EditableModelConfig>;
  defaultModel: ModelSelection | null;
};

const PROVIDER_OPTIONS = [
  { value: "openai-compatible", label: "OpenAI Compatible" },
  { value: "google-genai", label: "Google GenAI" },
] as const;

const buildModelUiId = (): string => crypto.randomUUID();

const hydrateModel = (model?: ProviderModelConfig): EditableProviderModelConfig => ({
  uiId: buildModelUiId(),
  name: model?.name || "",
  contextWindow: model?.contextWindow ?? 256000,
  thinkType: model?.thinkType || "enabled",
});

const serializeModel = (model: ProviderModelConfig): ProviderModelConfig => model;

const hydrateModelConfigs = (
  modelConfigs: Record<string, ModelConfig>,
): Record<string, EditableModelConfig> =>
  Object.fromEntries(
    Object.entries(modelConfigs).map(([configId, config]) => [
      configId,
      {
        ...config,
        models: config.models.map((model) => hydrateModel(model)),
      },
    ]),
  );

const serializeModelConfigs = (
  modelConfigs: Record<string, EditableModelConfig>,
): Record<string, ModelConfig> =>
  Object.fromEntries(
    Object.entries(modelConfigs).map(([configId, config]) => [
      configId,
      {
        ...config,
        models: config.models.map(({ uiId: _uiId, ...model }) =>
          serializeModel(model as ProviderModelConfig),
        ),
      },
    ]),
  );

const buildEmptyModel = (): EditableProviderModelConfig => hydrateModel();

const buildEmptyProvider = (): EditableModelConfig => ({
  provider: "openai-compatible",
  apiKey: "",
  baseURL: "",
  compressionThreshold: 0.8,
  targetRatio: 0.5,
  preserveRecentMessages: 8,
  minMessagesToCompress: 4,
  models: [buildEmptyModel()],
});

const getNextConfigId = (modelConfigs: Record<string, ModelConfig>): string => {
  let index = Object.keys(modelConfigs).length + 1;
  while (modelConfigs[`provider-${index}`]) {
    index += 1;
  }
  return `provider-${index}`;
};

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const { config } = useWebSocketContext();
  const [settings, setSettings] = useState<EditableSettings | null>(null);
  const [activeConfigId, setActiveConfigId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await getUserModelConfigs(config.url);
        if (cancelled) {
          return;
        }
        setSettings({
          modelConfigs: hydrateModelConfigs(response.modelConfigs),
          defaultModel: response.defaultModel || null,
        });
        setActiveConfigId(Object.keys(response.modelConfigs)[0] || "");
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [config.url, open]);

  const configEntries = useMemo(
    () => Object.entries(settings?.modelConfigs || {}),
    [settings?.modelConfigs],
  );
  const activeConfig = activeConfigId ? settings?.modelConfigs[activeConfigId] : undefined;
  const flattenedModels = useMemo(
    () => flattenModelConfigs(serializeModelConfigs(settings?.modelConfigs || {})),
    [settings?.modelConfigs],
  );

  const updateConfig = (configId: string, updater: (config: ModelConfig) => ModelConfig) => {
    setSettings((prev) => {
      if (!prev?.modelConfigs[configId]) {
        return prev;
      }
      const nextConfig = updater(prev.modelConfigs[configId]);
      return {
        ...prev,
        modelConfigs: {
          ...prev.modelConfigs,
          [configId]: nextConfig as EditableModelConfig,
        },
      };
    });
  };

  const updateModel = (
    configId: string,
    index: number,
    updater: (model: ProviderModelConfig) => ProviderModelConfig,
  ) => {
    updateConfig(configId, (config) => ({
      ...config,
      models: config.models.map((model, modelIndex) =>
        modelIndex === index ? updater(model) : model,
      ),
    }));
  };

  const handleRenameConfigId = (previousId: string, nextIdRaw: string) => {
    const nextId = nextIdRaw.trim();
    if (!nextId || nextId === previousId) {
      return;
    }

    setSettings((prev) => {
      if (!prev || prev.modelConfigs[nextId] || !prev.modelConfigs[previousId]) {
        return prev;
      }

      const nextConfigs = Object.fromEntries(
        Object.entries(prev.modelConfigs).map(([configId, config]) => [
          configId === previousId ? nextId : configId,
          config,
        ]),
      );

      const nextDefaultModel =
        prev.defaultModel?.configId === previousId
          ? { ...prev.defaultModel, configId: nextId }
          : prev.defaultModel;

      return {
        ...prev,
        modelConfigs: nextConfigs,
        defaultModel: nextDefaultModel,
      };
    });
    setActiveConfigId(nextId);
  };

  const handleAddProvider = () => {
    const nextId = getNextConfigId(settings?.modelConfigs || {});
    setSettings((prev) => ({
      modelConfigs: {
        ...(prev?.modelConfigs || {}),
        [nextId]: buildEmptyProvider(),
      },
      defaultModel: prev?.defaultModel || null,
    }));
    setActiveConfigId(nextId);
  };

  const handleDeleteProvider = (configId: string) => {
    setSettings((prev) => {
      if (!prev) {
        return prev;
      }

      const nextConfigs = { ...prev.modelConfigs };
      delete nextConfigs[configId];
      const nextConfigIds = Object.keys(nextConfigs);
      const nextDefaultModel = prev.defaultModel?.configId === configId ? null : prev.defaultModel;

      if (activeConfigId === configId) {
        setActiveConfigId(nextConfigIds[0] || "");
      }

      return {
        modelConfigs: nextConfigs,
        defaultModel: nextDefaultModel,
      };
    });
  };

  const handleSetDefaultModel = (selection: ModelSelection) => {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            defaultModel: selection,
          }
        : prev,
    );
  };

  const handleSave = async () => {
    if (!settings) {
      return;
    }

    setSaving(true);
    try {
      await upsertUserModelConfigs(config.url, {
        modelConfigs: serializeModelConfigs(settings.modelConfigs),
        defaultModel: settings.defaultModel,
      });
      toast.success("设置已保存");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-4 py-6">
      <div className="flex h-[min(860px,92vh)] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-[#f8f8f8] shadow-xl">
        <aside className="flex w-[280px] flex-col border-r border-slate-200 bg-[#fbfbfb]">
          <div className="border-b border-slate-200 px-5 pb-4 pt-5">
            <div className="text-xl font-semibold text-slate-900">设置</div>
            <div className="mt-1 text-sm text-slate-500">模型平台</div>
            <button
              type="button"
              onClick={handleAddProvider}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              添加平台
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载中...
              </div>
            ) : configEntries.length > 0 ? (
              <div className="space-y-2">
                {configEntries.map(([configId, providerConfig]) => {
                  const isActive = configId === activeConfigId;
                  return (
                    <button
                      key={configId}
                      type="button"
                      onClick={() => setActiveConfigId(configId)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                        isActive
                          ? "border-slate-200 bg-white text-slate-950"
                          : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white"
                      }`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold uppercase text-slate-700">
                        {configId.slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{configId}</div>
                        <div className="mt-1 truncate text-xs text-slate-400">
                          {providerConfig.provider} · {providerConfig.models.length} 个模型
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                还没有模型平台配置。点击上方“添加平台”开始。
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <div className="text-2xl font-semibold text-slate-900">
                {activeConfigId || "未选择平台"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 transition hover:bg-white hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存设置
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {activeConfig && settings ? (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-6">
                  <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">基础信息</div>
                        <div className="mt-1 text-sm text-slate-500">
                          一个 provider config 对应一套鉴权和基础地址。
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteProvider(activeConfigId)}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        删除平台
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="配置 ID">
                        <input
                          value={activeConfigId}
                          onChange={(event) =>
                            handleRenameConfigId(activeConfigId, event.target.value)
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-950 focus:bg-white"
                        />
                      </Field>
                      <Field label="Provider">
                        <select
                          value={activeConfig.provider}
                          onChange={(event) =>
                            updateConfig(activeConfigId, (config) => ({
                              ...config,
                              provider: event.target.value,
                            }))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-950 focus:bg-white"
                        >
                          {PROVIDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="API 密钥" icon={<KeyRound className="h-4 w-4" />}>
                        <input
                          value={activeConfig.apiKey}
                          onChange={(event) =>
                            updateConfig(activeConfigId, (config) => ({
                              ...config,
                              apiKey: event.target.value,
                            }))
                          }
                          placeholder="sk-..."
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-950 focus:bg-white"
                        />
                      </Field>
                      <Field label="API 地址" icon={<Server className="h-4 w-4" />}>
                        <input
                          value={activeConfig.baseURL || ""}
                          onChange={(event) =>
                            updateConfig(activeConfigId, (config) => ({
                              ...config,
                              baseURL: event.target.value,
                            }))
                          }
                          placeholder="https://..."
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-950 focus:bg-white"
                        />
                      </Field>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <NumberField
                        label="压缩阈值"
                        value={activeConfig.compressionThreshold}
                        onChange={(value) =>
                          updateConfig(activeConfigId, (config) => ({
                            ...config,
                            compressionThreshold: value,
                          }))
                        }
                        step="0.05"
                      />
                      <NumberField
                        label="目标比例"
                        value={activeConfig.targetRatio}
                        onChange={(value) =>
                          updateConfig(activeConfigId, (config) => ({
                            ...config,
                            targetRatio: value,
                          }))
                        }
                        step="0.05"
                      />
                      <NumberField
                        label="保留消息数"
                        value={activeConfig.preserveRecentMessages}
                        onChange={(value) =>
                          updateConfig(activeConfigId, (config) => ({
                            ...config,
                            preserveRecentMessages: value,
                          }))
                        }
                      />
                      <NumberField
                        label="最少压缩消息数"
                        value={activeConfig.minMessagesToCompress}
                        onChange={(value) =>
                          updateConfig(activeConfigId, (config) => ({
                            ...config,
                            minMessagesToCompress: value,
                          }))
                        }
                      />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">模型列表</div>
                        <div className="mt-1 text-sm text-slate-500">
                          每个平台下可以挂多种模型，每个模型单独填写上下文窗口和 think 类型。
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateConfig(activeConfigId, (config) => ({
                            ...config,
                            models: [...config.models, buildEmptyModel()],
                          }))
                        }
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                      >
                        <Plus className="h-4 w-4" />
                        添加模型
                      </button>
                    </div>

                    <div className="space-y-4">
                      {activeConfig.models.map((model, index) => {
                        const isDefault =
                          settings.defaultModel?.configId === activeConfigId &&
                          settings.defaultModel.model === model.name;

                        return (
                          <div
                            key={model.uiId}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-700">
                                  <Bot className="h-4 w-4" />
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {model.name || `模型 ${index + 1}`}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-400">
                                    {isDefault ? "当前默认模型" : "可在对话输入框中切换"}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSetDefaultModel({
                                      configId: activeConfigId,
                                      model: model.name,
                                    })
                                  }
                                  disabled={!model.name.trim()}
                                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                                    isDefault
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                  } disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                  {isDefault ? <Check className="h-4 w-4" /> : null}
                                  设为默认
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateConfig(activeConfigId, (config) => ({
                                      ...config,
                                      models: config.models.filter(
                                        (_, modelIndex) => modelIndex !== index,
                                      ),
                                    }))
                                  }
                                  className="rounded-xl border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                              <Field label="模型名">
                                <input
                                  value={model.name}
                                  onChange={(event) =>
                                    updateModel(activeConfigId, index, (current) => ({
                                      ...current,
                                      name: event.target.value,
                                    }))
                                  }
                                  placeholder="doubao-seed-2.0-pro"
                                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-950 focus:bg-white"
                                />
                              </Field>
                              <NumberField
                                label="上下文窗口"
                                value={model.contextWindow}
                                onChange={(value) =>
                                  updateModel(activeConfigId, index, (current) => ({
                                    ...current,
                                    contextWindow: value,
                                  }))
                                }
                              />
                              <Field label="Think 类型">
                                <select
                                  value={model.thinkType || "enabled"}
                                  onChange={(event) =>
                                    updateModel(activeConfigId, index, (current) => ({
                                      ...current,
                                      thinkType: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-950 focus:bg-white"
                                >
                                  <option value="enabled">enabled</option>
                                  <option value="disabled">disabled</option>
                                  <option value="auto">auto</option>
                                </select>
                              </Field>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>

                <aside className="space-y-6">
                  <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                    <div className="text-lg font-semibold text-slate-900">默认模型</div>
                    <div className="mt-2 text-sm leading-6 text-slate-500">
                      新会话和空闲会话在发送下一条消息前，都会优先使用这里的默认选择。
                    </div>
                    <div className="mt-4 space-y-2">
                      {flattenedModels.length > 0 ? (
                        flattenedModels.map((model) => {
                          const selected =
                            settings.defaultModel?.configId === model.configId &&
                            settings.defaultModel.model === model.model;
                          return (
                            <button
                              key={`${model.configId}::${model.model}`}
                              type="button"
                              onClick={() =>
                                handleSetDefaultModel({
                                  configId: model.configId,
                                  model: model.model,
                                })
                              }
                              className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                                selected
                                  ? "border-emerald-200 bg-emerald-50"
                                  : "border-slate-200 bg-slate-50 hover:bg-white"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {model.model}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-400">
                                    {model.configId} · {model.provider}
                                  </div>
                                </div>
                                {selected ? (
                                  <span className="rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white">
                                    默认
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                          先给平台添加至少一个模型。
                        </div>
                      )}
                    </div>
                  </section>
                </aside>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md rounded-2xl border border-dashed border-slate-200 bg-white px-8 py-10 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-slate-700">
                    <Server className="h-6 w-6" />
                  </div>
                  <div className="mt-5 text-xl font-semibold text-slate-900">还没有平台配置</div>
                  <div className="mt-2 text-sm leading-6 text-slate-500">
                    添加一个 provider config，然后在下面挂上模型，就能在对话里直接切换。
                  </div>
                  <button
                    type="button"
                    onClick={handleAddProvider}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    立即添加
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, icon, children }) => (
  <div className="block space-y-2">
    <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
      {icon}
      {label}
    </span>
    {children}
  </div>
);

const NumberField: React.FC<{
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  step?: string;
}> = ({ label, value, onChange, step = "1" }) => (
  <Field label={label}>
    <input
      type="number"
      value={value ?? ""}
      step={step}
      onChange={(event) => {
        const rawValue = event.target.value.trim();
        onChange(rawValue ? Number(rawValue) : undefined);
      }}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-400"
    />
  </Field>
);

export default SettingsModal;
