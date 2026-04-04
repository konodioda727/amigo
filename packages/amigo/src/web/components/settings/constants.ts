import type { SettingsPageDefinition } from "./types";

export const PROVIDER_OPTIONS = [
  { value: "openai-compatible", label: "OpenAI Compatible" },
  { value: "google-genai", label: "Google GenAI" },
] as const;

export const SETTINGS_PAGES: SettingsPageDefinition[] = [
  {
    id: "provider-configs",
    label: "模型配置",
    description: "平台与模型",
    title: "模型配置",
    pageDescription: "",
    sidebarTitle: "配置列表",
  },
  {
    id: "message-channels",
    label: "消息通道",
    description: "飞书通道",
    title: "飞书通道",
    pageDescription: "",
    sidebarTitle: "通道列表",
  },
];

export const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400";
