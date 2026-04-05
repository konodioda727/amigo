import type {
  ModelConfig,
  ModelSelection,
  NotificationChannelRecord,
  ProviderModelConfig,
} from "@/utils/serverAdmin";

export type EditableProviderModelConfig = ProviderModelConfig & {
  uiId: string;
};

export type EditableModelConfig = Omit<ModelConfig, "models"> & {
  models: EditableProviderModelConfig[];
};

export type EditableSettings = {
  modelConfigs: Record<string, EditableModelConfig>;
  defaultModel: ModelSelection | null;
  memoryExtractorModel: ModelSelection | null;
};

export type SettingsTab = "provider-configs" | "message-channels";

export interface SettingsTabDefinition {
  id: SettingsTab;
  label: string;
  description: string;
}

export interface SettingsPageDefinition extends SettingsTabDefinition {
  title: string;
  pageDescription?: string;
  sidebarTitle: string;
}

export interface SettingsListItem {
  id: string;
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
}

export type NotificationChannelState = NotificationChannelRecord;
