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
  "w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
