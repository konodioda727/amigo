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
  <div className="w-full space-y-6 pb-6">
    <section className="rounded-sm border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-2.5">
        <div className="text-[13px] font-semibold text-slate-900">飞书应用配置</div>
      </div>

      <div className="grid gap-6 px-5 py-5 md:grid-cols-2">
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

    <section className="rounded-sm border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-2.5">
        <div className="text-[13px] font-semibold text-slate-900">通道实例列表</div>
      </div>

      {channels.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {channels.map((channel) => (
            <div key={channel.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-[13px] font-semibold text-slate-900">
                      {channel.name.replace(/^feishu:/, "")}
                    </div>
                    {channel.isDefault ? (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        默认路由
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {getChatTypeLabel(String(channel.config.chatType || ""))} · 最近同步{" "}
                    {formatDateTime(channel.updatedAt)}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {!channel.isDefault ? (
                    <button
                      type="button"
                      onClick={() => onSetDefaultChannel(channel.id)}
                      className="text-[12px] font-semibold text-slate-500 transition hover:text-blue-600"
                    >
                      设为默认
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onToggleChannelEnabled(channel.id, !channel.enabled)}
                    className={`text-[12px] font-semibold transition ${
                      channel.enabled
                        ? "text-rose-500 hover:text-rose-700"
                        : "text-blue-600 hover:text-blue-700"
                    }`}
                  >
                    {channel.enabled ? "停用" : "启用"}
                  </button>
                </div>
              </div>

              <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs text-slate-500 md:grid-cols-2">
                <DataItem label="会话 ID" value={String(channel.config.chatId || "未记录")} />
                <DataItem label="Tenant Key" value={String(channel.config.tenantKey || "未记录")} />
              </dl>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-6 text-[13px] leading-6 text-slate-500">
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
  <div className="space-y-1.5">
    <div>
      <div className="text-[13px] font-medium text-slate-900">{label}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>
    </div>
    {children}
  </div>
);

const DataItem: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => (
  <div className="flex items-center gap-2 rounded bg-slate-50/50 px-2.5 py-1.5 border border-slate-100">
    <dt className="shrink-0 font-medium text-slate-500">{label}</dt>
    <dd className="truncate text-slate-700">{value}</dd>
  </div>
);

export default MessageChannelsSection;
