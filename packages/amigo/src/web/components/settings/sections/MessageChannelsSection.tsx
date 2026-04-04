import type React from "react";
import type { NotificationChannelRecord } from "@/utils/serverAdmin";
import { INPUT_CLASS } from "../constants";
import { formatDateTime, getChatTypeLabel } from "../helpers";

interface MessageChannelsSectionProps {
  appId: string;
  appSecret: string;
  appIdConfigured: boolean;
  appSecretConfigured: boolean;
  channels: NotificationChannelRecord[];
  onAppIdChange: (value: string) => void;
  onAppSecretChange: (value: string) => void;
  onSetDefaultChannel: (channelId: string) => void;
  onToggleChannelEnabled: (channelId: string, enabled: boolean) => void;
}

const MessageChannelsSection: React.FC<MessageChannelsSectionProps> = ({
  appId,
  appSecret,
  appIdConfigured,
  appSecretConfigured,
  channels,
  onAppIdChange,
  onAppSecretChange,
  onSetDefaultChannel,
  onToggleChannelEnabled,
}) => (
  <div className="mx-auto w-full max-w-4xl space-y-4">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-3.5">
        <div className="text-sm font-medium text-slate-950">飞书应用</div>
      </div>

      <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
        <Field
          label="App ID"
          hint={appIdConfigured ? "已配置，留空表示保持现有值" : "保存后加密存储，不会再回显"}
        >
          <input
            type="password"
            value={appId}
            autoComplete="new-password"
            spellCheck={false}
            onChange={(event) => onAppIdChange(event.target.value)}
            placeholder={appIdConfigured ? "已配置，如需更新请重新输入" : "输入飞书 App ID"}
            className={INPUT_CLASS}
          />
        </Field>

        <Field
          label="App Secret"
          hint={
            appSecretConfigured
              ? "已配置，留空表示保持现有值"
              : "只用于服务端鉴权，前端不会读取旧值"
          }
        >
          <input
            type="password"
            value={appSecret}
            autoComplete="new-password"
            spellCheck={false}
            onChange={(event) => onAppSecretChange(event.target.value)}
            placeholder={appSecretConfigured ? "已配置，如需更新请重新输入" : "输入飞书 App Secret"}
            className={INPUT_CLASS}
          />
        </Field>
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-3.5">
        <div className="text-sm font-medium text-slate-950">通道实例</div>
      </div>

      {channels.length > 0 ? (
        <div className="divide-y divide-slate-200">
          {channels.map((channel) => (
            <div key={channel.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {channel.name.replace(/^feishu:/, "")}
                    </div>
                    {channel.isDefault ? (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
                        默认
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {getChatTypeLabel(String(channel.config.chatType || ""))} · 最近同步{" "}
                    {formatDateTime(channel.updatedAt)}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {!channel.isDefault ? (
                    <button
                      type="button"
                      onClick={() => onSetDefaultChannel(channel.id)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    >
                      设为默认
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onToggleChannelEnabled(channel.id, !channel.enabled)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                      channel.enabled
                        ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                        : "border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-950"
                    }`}
                  >
                    {channel.enabled ? "停用" : "启用"}
                  </button>
                </div>
              </div>

              <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs text-slate-500 md:grid-cols-2">
                <DataItem label="会话 ID" value={String(channel.config.chatId || "未记录")} />
                <DataItem label="Tenant Key" value={String(channel.config.tenantKey || "未记录")} />
              </dl>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-6 text-sm leading-6 text-slate-500">
          还没有登记到飞书通道。先给 Amigo 发一条飞书消息，系统会自动创建通道实例。
        </div>
      )}
    </section>
  </div>
);

const Field: React.FC<{
  label: string;
  hint: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="space-y-2">
    <div>
      <div className="text-sm font-medium text-slate-900">{label}</div>
      <div className="mt-0.5 text-xs text-slate-500">{hint}</div>
    </div>
    {children}
  </div>
);

const DataItem: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => (
  <div className="flex items-center gap-2">
    <dt className="shrink-0 text-slate-400">{label}</dt>
    <dd className="truncate text-slate-600">{value}</dd>
  </div>
);

export default MessageChannelsSection;
