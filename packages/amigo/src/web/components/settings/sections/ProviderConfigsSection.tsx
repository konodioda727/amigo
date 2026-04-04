import type React from "react";
import type { ModelConfig, ModelSelection, ProviderModelConfig } from "@/utils/serverAdmin";
import { INPUT_CLASS, PROVIDER_OPTIONS } from "../constants";
import { getProviderLabel } from "../helpers";
import type { EditableModelConfig, EditableSettings } from "../types";
import { EmptyStateCard, Field, NumberField } from "../ui";

interface ProviderConfigsSectionProps {
  activeConfigId: string;
  activeConfig?: EditableModelConfig;
  settings: EditableSettings;
  onAddConfig: () => void;
  onDeleteConfig: (configId: string) => void;
  onRenameConfigId: (previousId: string, nextId: string) => void;
  onUpdateConfig: (configId: string, updater: (config: ModelConfig) => ModelConfig) => void;
  onAddModel: (configId: string) => void;
  onDeleteModel: (configId: string, index: number) => void;
  onRenameModel: (configId: string, index: number, nextName: string) => void;
  onUpdateModel: (
    configId: string,
    index: number,
    updater: (model: ProviderModelConfig) => ProviderModelConfig,
  ) => void;
  onSetDefaultModel: (selection: ModelSelection) => void;
}

const ProviderConfigsSection: React.FC<ProviderConfigsSectionProps> = ({
  activeConfigId,
  activeConfig,
  settings,
  onAddConfig,
  onDeleteConfig,
  onRenameConfigId,
  onUpdateConfig,
  onAddModel,
  onDeleteModel,
  onRenameModel,
  onUpdateModel,
  onSetDefaultModel,
}) => {
  if (!activeConfig) {
    return (
      <EmptyStateCard
        title="还没有配置"
        description="先添加一个配置。"
        action={
          <button
            type="button"
            onClick={onAddConfig}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            添加配置
          </button>
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-slate-950">{activeConfigId}</div>
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
              {getProviderLabel(activeConfig.provider)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onDeleteConfig(activeConfigId)}
            className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs text-rose-600 transition hover:bg-rose-50"
          >
            删除
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
          <Field label="配置 ID">
            <input
              value={activeConfigId}
              onChange={(event) => onRenameConfigId(activeConfigId, event.target.value)}
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Provider">
            <select
              value={activeConfig.provider}
              onChange={(event) =>
                onUpdateConfig(activeConfigId, (config) => ({
                  ...config,
                  provider: event.target.value,
                }))
              }
              className={INPUT_CLASS}
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="API 密钥">
            <div className="space-y-2">
              <input
                type="password"
                value={activeConfig.apiKey}
                onChange={(event) =>
                  onUpdateConfig(activeConfigId, (config) => ({
                    ...config,
                    apiKey: event.target.value,
                    hasApiKey: config.hasApiKey || !!event.target.value.trim(),
                  }))
                }
                placeholder={activeConfig.hasApiKey ? "已配置，留空则不修改" : "sk-..."}
                className={INPUT_CLASS}
              />
              <div className="text-xs text-slate-500">
                {activeConfig.hasApiKey
                  ? "服务端已保存密钥，除非要替换，否则这里保持为空。"
                  : "首次保存前需要填写 API 密钥。"}
              </div>
            </div>
          </Field>

          <Field label="API 地址">
            <input
              value={activeConfig.baseURL || ""}
              onChange={(event) =>
                onUpdateConfig(activeConfigId, (config) => ({
                  ...config,
                  baseURL: event.target.value,
                }))
              }
              placeholder="https://..."
              className={INPUT_CLASS}
            />
          </Field>

          <NumberField
            label="压缩阈值"
            value={activeConfig.compressionThreshold}
            onChange={(value) =>
              onUpdateConfig(activeConfigId, (config) => ({
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
              onUpdateConfig(activeConfigId, (config) => ({
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
              onUpdateConfig(activeConfigId, (config) => ({
                ...config,
                preserveRecentMessages: value,
              }))
            }
          />

          <NumberField
            label="最少压缩消息数"
            value={activeConfig.minMessagesToCompress}
            onChange={(value) =>
              onUpdateConfig(activeConfigId, (config) => ({
                ...config,
                minMessagesToCompress: value,
              }))
            }
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="text-sm font-medium text-slate-950">模型</div>
          <button
            type="button"
            onClick={() => onAddModel(activeConfigId)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            添加模型
          </button>
        </div>

        <div className="divide-y divide-slate-200">
          {activeConfig.models.length > 0 ? (
            activeConfig.models.map((model, index) => {
              const isDefault =
                settings.defaultModel?.configId === activeConfigId &&
                settings.defaultModel.model === model.name;

              return (
                <div key={model.uiId} className="px-5 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-slate-900">
                        {model.name || `模型 ${index + 1}`}
                      </div>
                      {isDefault ? (
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-white">
                          默认
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isDefault ? (
                        <button
                          type="button"
                          onClick={() =>
                            onSetDefaultModel({
                              configId: activeConfigId,
                              model: model.name,
                            })
                          }
                          disabled={!model.name.trim()}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          设为默认
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onDeleteModel(activeConfigId, index)}
                        className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs text-rose-600 transition hover:bg-rose-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="模型名">
                      <input
                        value={model.name}
                        onChange={(event) =>
                          onRenameModel(activeConfigId, index, event.target.value)
                        }
                        placeholder="doubao-seed-2.0-pro"
                        className={INPUT_CLASS}
                      />
                    </Field>

                    <NumberField
                      label="上下文窗口"
                      value={model.contextWindow}
                      onChange={(value) =>
                        onUpdateModel(activeConfigId, index, (current) => ({
                          ...current,
                          contextWindow: value,
                        }))
                      }
                    />

                    <Field label="Think 类型">
                      <select
                        value={model.thinkType || "enabled"}
                        onChange={(event) =>
                          onUpdateModel(activeConfigId, index, (current) => ({
                            ...current,
                            thinkType: event.target.value,
                          }))
                        }
                        className={INPUT_CLASS}
                      >
                        <option value="enabled">enabled</option>
                        <option value="disabled">disabled</option>
                        <option value="auto">auto</option>
                      </select>
                    </Field>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-5 py-6 text-sm text-slate-500">还没有模型。</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ProviderConfigsSection;
