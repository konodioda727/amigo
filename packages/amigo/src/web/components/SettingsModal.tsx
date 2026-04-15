import { useWebSocketContext } from "@amigo-llm/frontend";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  type FeishuIntegrationSettings,
  getFeishuIntegration,
  getUserModelConfigs,
  listNotificationChannels,
  type ModelSelection,
  type NotificationChannelRecord,
  upsertFeishuIntegration,
  upsertNotificationChannels,
  upsertUserModelConfigs,
} from "@/utils/serverAdmin";
import { emitSettingsUpdated } from "@/utils/settingsModal";
import { toast } from "@/utils/toast";
import { SETTINGS_PAGES } from "./settings/constants";
import {
  buildEmptyModel,
  buildEmptyProvider,
  getNextConfigId,
  getProviderLabel,
  hydrateEditableSettings,
  normalizeNotificationChannels,
  serializeModelConfigs,
} from "./settings/helpers";
import SelectionList from "./settings/SelectionList";
import SettingsShell from "./settings/SettingsShell";
import MessageChannelsSection from "./settings/sections/MessageChannelsSection";
import ProviderConfigsSection from "./settings/sections/ProviderConfigsSection";
import type {
  EditableModelConfig,
  EditableProviderModelConfig,
  EditableSettings,
  SettingsListItem,
  SettingsTab,
} from "./settings/types";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const { config } = useWebSocketContext();
  const [settings, setSettings] = useState<EditableSettings | null>(null);
  const [notificationChannels, setNotificationChannels] = useState<NotificationChannelRecord[]>([]);
  const [feishuIntegration, setFeishuIntegration] = useState<FeishuIntegrationSettings | null>(
    null,
  );
  const [feishuDraft, setFeishuDraft] = useState({
    appId: "",
    appSecret: "",
  });
  const [activeConfigId, setActiveConfigId] = useState("");
  const [activeTab, setActiveTab] = useState<SettingsTab>("provider-configs");
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
        const [modelResponse, channelResponse, feishuResponse] = await Promise.all([
          getUserModelConfigs(config.url),
          listNotificationChannels(config.url),
          getFeishuIntegration(config.url),
        ]);
        if (cancelled) {
          return;
        }

        const nextChannels = normalizeNotificationChannels(channelResponse.channels);
        setSettings(
          hydrateEditableSettings(
            modelResponse.modelConfigs,
            modelResponse.defaultModel || null,
            modelResponse.memoryExtractorModel || null,
          ),
        );
        setNotificationChannels(nextChannels);
        setFeishuIntegration(feishuResponse);
        setFeishuDraft({
          appId: "",
          appSecret: "",
        });
        setActiveConfigId(Object.keys(modelResponse.modelConfigs)[0] || "");
        setActiveTab("provider-configs");
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
  const activePage = SETTINGS_PAGES.find((page) => page.id === activeTab) || SETTINGS_PAGES[0];

  const updateConfig = (
    configId: string,
    updater: (config: EditableModelConfig) => EditableModelConfig,
  ) => {
    setSettings((prev) => {
      if (!prev?.modelConfigs[configId]) {
        return prev;
      }
      const nextConfig = updater(prev.modelConfigs[configId]);
      return {
        ...prev,
        modelConfigs: {
          ...prev.modelConfigs,
          [configId]: nextConfig,
        },
      };
    });
  };

  const updateModel = (
    configId: string,
    index: number,
    updater: (model: EditableProviderModelConfig) => EditableProviderModelConfig,
  ) => {
    updateConfig(configId, (config) => ({
      ...config,
      models: config.models.map((model, modelIndex) =>
        modelIndex === index ? updater(model) : model,
      ),
    }));
  };

  const updateChannel = (
    channelId: string,
    updater: (channel: NotificationChannelRecord) => NotificationChannelRecord,
  ) => {
    setNotificationChannels((prev) =>
      normalizeNotificationChannels(
        prev.map((channel) => (channel.id === channelId ? updater(channel) : channel)),
      ),
    );
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
        Object.entries(prev.modelConfigs).map(([configId, configValue]) => [
          configId === previousId ? nextId : configId,
          configValue,
        ]),
      );

      const nextDefaultModel =
        prev.defaultModel?.configId === previousId
          ? { ...prev.defaultModel, configId: nextId }
          : prev.defaultModel;
      const nextMemoryExtractorModel =
        prev.memoryExtractorModel?.configId === previousId
          ? { ...prev.memoryExtractorModel, configId: nextId }
          : prev.memoryExtractorModel;

      return {
        ...prev,
        modelConfigs: nextConfigs,
        defaultModel: nextDefaultModel,
        memoryExtractorModel: nextMemoryExtractorModel,
      };
    });
    setActiveConfigId(nextId);
  };

  const handleAddConfig = () => {
    const nextId = getNextConfigId(settings?.modelConfigs || {});
    setSettings((prev) => ({
      modelConfigs: {
        ...(prev?.modelConfigs || {}),
        [nextId]: buildEmptyProvider(),
      },
      defaultModel: prev?.defaultModel || null,
      memoryExtractorModel: prev?.memoryExtractorModel || null,
    }));
    setActiveConfigId(nextId);
    setActiveTab("provider-configs");
  };

  const handleDeleteConfig = (configId: string) => {
    setSettings((prev) => {
      if (!prev) {
        return prev;
      }

      const nextConfigs = { ...prev.modelConfigs };
      delete nextConfigs[configId];
      const nextConfigIds = Object.keys(nextConfigs);
      const nextDefaultModel = prev.defaultModel?.configId === configId ? null : prev.defaultModel;
      const nextMemoryExtractorModel =
        prev.memoryExtractorModel?.configId === configId ? null : prev.memoryExtractorModel;

      if (activeConfigId === configId) {
        setActiveConfigId(nextConfigIds[0] || "");
      }

      return {
        modelConfigs: nextConfigs,
        defaultModel: nextDefaultModel,
        memoryExtractorModel: nextMemoryExtractorModel,
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

  const handleSetMemoryExtractorModel = (selection: ModelSelection | null) => {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            memoryExtractorModel: selection,
          }
        : prev,
    );
  };

  const handleAddModel = (configId: string) => {
    updateConfig(configId, (configValue) => ({
      ...configValue,
      models: [...configValue.models, buildEmptyModel()],
    }));
  };

  const handleDeleteModel = (configId: string, index: number) => {
    setSettings((prev) => {
      if (!prev?.modelConfigs[configId]) {
        return prev;
      }

      const currentConfig = prev.modelConfigs[configId];
      const removedModel = currentConfig.models[index];
      if (!removedModel) {
        return prev;
      }

      const nextDefaultModel =
        prev.defaultModel?.configId === configId && prev.defaultModel.model === removedModel.name
          ? null
          : prev.defaultModel;
      const nextMemoryExtractorModel =
        prev.memoryExtractorModel?.configId === configId &&
        prev.memoryExtractorModel.model === removedModel.name
          ? null
          : prev.memoryExtractorModel;

      return {
        ...prev,
        modelConfigs: {
          ...prev.modelConfigs,
          [configId]: {
            ...currentConfig,
            models: currentConfig.models.filter((_, modelIndex) => modelIndex !== index),
          },
        },
        defaultModel: nextDefaultModel,
        memoryExtractorModel: nextMemoryExtractorModel,
      };
    });
  };

  const handleRenameModel = (configId: string, index: number, nextName: string) => {
    setSettings((prev) => {
      if (!prev?.modelConfigs[configId]) {
        return prev;
      }

      const currentConfig = prev.modelConfigs[configId];
      const currentModel = currentConfig.models[index];
      if (!currentModel) {
        return prev;
      }

      const nextDefaultModel =
        prev.defaultModel?.configId === configId && prev.defaultModel.model === currentModel.name
          ? { ...prev.defaultModel, model: nextName }
          : prev.defaultModel;
      const nextMemoryExtractorModel =
        prev.memoryExtractorModel?.configId === configId &&
        prev.memoryExtractorModel.model === currentModel.name
          ? { ...prev.memoryExtractorModel, model: nextName }
          : prev.memoryExtractorModel;

      return {
        ...prev,
        modelConfigs: {
          ...prev.modelConfigs,
          [configId]: {
            ...currentConfig,
            models: currentConfig.models.map((model, modelIndex) =>
              modelIndex === index ? { ...model, name: nextName } : model,
            ),
          },
        },
        defaultModel: nextDefaultModel,
        memoryExtractorModel: nextMemoryExtractorModel,
      };
    });
  };

  const handleSetDefaultChannel = (channelId: string) => {
    updateChannel(channelId, (channel) => ({
      ...channel,
      enabled: true,
      isDefault: true,
    }));
  };

  const handleToggleChannelEnabled = (channelId: string, enabled: boolean) => {
    updateChannel(channelId, (channel) => ({
      ...channel,
      enabled,
      isDefault: enabled ? channel.isDefault : false,
    }));
  };

  const handleSave = async () => {
    if (!settings) {
      return;
    }

    setSaving(true);
    try {
      const nextAppId = feishuDraft.appId.trim();
      const nextAppSecret = feishuDraft.appSecret.trim();
      const [nextModelSettings, nextChannelSettings, nextFeishuIntegration] = await Promise.all([
        upsertUserModelConfigs(config.url, {
          modelConfigs: serializeModelConfigs(settings.modelConfigs),
          defaultModel: settings.defaultModel,
          memoryExtractorModel: settings.memoryExtractorModel,
        }),
        upsertNotificationChannels(config.url, {
          channels: notificationChannels.map((channel) => ({
            id: channel.id,
            enabled: channel.enabled,
            isDefault: channel.isDefault,
          })),
        }),
        upsertFeishuIntegration(config.url, {
          ...(nextAppId ? { appId: nextAppId } : {}),
          ...(nextAppSecret ? { appSecret: nextAppSecret } : {}),
        }),
      ]);

      const nextChannels = normalizeNotificationChannels(nextChannelSettings.channels);
      setSettings(
        hydrateEditableSettings(
          nextModelSettings.modelConfigs,
          nextModelSettings.defaultModel,
          nextModelSettings.memoryExtractorModel || null,
        ),
      );
      setNotificationChannels(nextChannels);
      setFeishuIntegration(nextFeishuIntegration);
      setFeishuDraft({
        appId: "",
        appSecret: "",
      });
      emitSettingsUpdated();

      toast.success("设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const providerListItems: SettingsListItem[] = configEntries.map(([configId, configValue]) => ({
    id: configId,
    label: configId,
    description: `${getProviderLabel(configValue.provider)} · ${configValue.models.length} 个模型`,
    active: activeTab === "provider-configs" && configId === activeConfigId,
    onClick: () => {
      setActiveConfigId(configId);
      setActiveTab("provider-configs");
    },
  }));

  const feishuChannels = notificationChannels.filter((channel) => channel.type === "feishu");
  const channelListItems: SettingsListItem[] = [
    {
      id: "feishu",
      label: "飞书通道",
      description:
        feishuIntegration?.appIdConfigured && feishuIntegration?.appSecretConfigured
          ? "已配置"
          : "未配置",
      active: activeTab === "message-channels",
      onClick: () => setActiveTab("message-channels"),
    },
  ];

  if (!open) {
    return null;
  }

  const sideList =
    activeTab === "message-channels" ? (
      <SelectionList items={channelListItems} emptyState={null} />
    ) : (
      <SelectionList
        items={providerListItems}
        emptyState={
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm leading-6 text-slate-500">
            还没有配置。先添加一个配置，再补全模型信息。
          </div>
        }
      />
    );

  const sideAction =
    activeTab === "provider-configs" ? (
      <button
        type="button"
        onClick={handleAddConfig}
        className="rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
      >
        添加配置
      </button>
    ) : null;

  return (
    <SettingsShell
      page={activePage}
      tabs={SETTINGS_PAGES}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      sideList={sideList}
      sideAction={sideAction}
      loading={loading}
      saving={saving}
      onClose={onClose}
      onSave={() => void handleSave()}
    >
      {activeTab === "message-channels" ? (
        <MessageChannelsSection
          appId={feishuDraft.appId}
          appSecret={feishuDraft.appSecret}
          appIdConfigured={!!feishuIntegration?.appIdConfigured}
          appSecretConfigured={!!feishuIntegration?.appSecretConfigured}
          channels={feishuChannels}
          onAppIdChange={(value) =>
            setFeishuDraft((prev) => ({
              ...prev,
              appId: value,
            }))
          }
          onAppSecretChange={(value) =>
            setFeishuDraft((prev) => ({
              ...prev,
              appSecret: value,
            }))
          }
          onSetDefaultChannel={handleSetDefaultChannel}
          onToggleChannelEnabled={handleToggleChannelEnabled}
        />
      ) : (
        <ProviderConfigsSection
          activeConfigId={activeConfigId}
          activeConfig={activeConfig}
          settings={
            settings || {
              modelConfigs: {},
              defaultModel: null,
              memoryExtractorModel: null,
            }
          }
          onAddConfig={handleAddConfig}
          onDeleteConfig={handleDeleteConfig}
          onRenameConfigId={handleRenameConfigId}
          onUpdateConfig={updateConfig}
          onAddModel={handleAddModel}
          onDeleteModel={handleDeleteModel}
          onRenameModel={handleRenameModel}
          onUpdateModel={updateModel}
          onSetDefaultModel={handleSetDefaultModel}
          onSetMemoryExtractorModel={handleSetMemoryExtractorModel}
        />
      )}
    </SettingsShell>
  );
};

export default SettingsModal;
