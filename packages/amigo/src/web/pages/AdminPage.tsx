import { useWebSocketContext } from "@amigo-llm/frontend";
import { Clock3, Loader2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  type AutomationDefinition,
  type AutomationSchedule,
  deleteAutomation,
  listAutomations,
} from "@/utils/serverAdmin";
import { toast } from "@/utils/toast";

const formatDateTime = (value?: string): string =>
  value ? new Date(value).toLocaleString("zh-CN") : "-";

const formatSchedule = (schedule: AutomationSchedule): string => {
  if (schedule.type === "once") {
    return `${schedule.afterMinutes} 分钟后执行一次`;
  }
  if (schedule.type === "interval") {
    return `每 ${schedule.everyMinutes} 分钟`;
  }
  if (schedule.type === "daily") {
    return `每天 ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
  }
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${weekdays[schedule.weekday]} ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
};

const AdminPage: React.FC = () => {
  const { config } = useWebSocketContext();
  const [automations, setAutomations] = useState<AutomationDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      setAutomations(await listAutomations(config.url));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [config.url]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDeleteAutomation = async (automationId: string) => {
    if (!window.confirm(`确定删除 automation ${automationId} 吗？`)) {
      return;
    }

    try {
      await deleteAutomation(config.url, automationId);
      setAutomations((prev) => prev.filter((automation) => automation.id !== automationId));
      toast.success(`automation 已删除: ${automationId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-neutral-50/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 md:px-6">
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-900">服务端定时任务</div>
              <p className="mt-1 text-sm text-gray-500">
                这里展示由模型创建的 `automations`。你可以刷新列表，或删除不再需要的自动化任务。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              刷新
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : (
          <div className="space-y-4">
            <section className="space-y-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-sm font-semibold text-gray-900">Automations</h2>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  列表中的 automation 由模型创建。这里仅提供查看和删除能力。
                </p>
              </div>

              <div className="space-y-3">
                {automations.map((automation) => (
                  <Card
                    key={automation.id}
                    title={automation.name}
                    subtitle={automation.id}
                    actions={
                      <>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAutomation(automation.id)}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 transition hover:bg-red-50"
                        >
                          删除
                        </button>
                      </>
                    }
                  >
                    <div className="space-y-2 text-sm text-gray-600">
                      <p className="line-clamp-3 whitespace-pre-wrap">{automation.prompt}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                        <span className="rounded-full bg-gray-100 px-2 py-1">
                          {formatSchedule(automation.schedule)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 ${
                            automation.enabled
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {automation.enabled ? "已启用" : "已停用"}
                        </span>
                      </div>
                      {automation.skillIds && automation.skillIds.length > 0 && (
                        <TagRow label="Skills" values={automation.skillIds} tone="emerald" />
                      )}
                      <div className="grid gap-2 text-xs text-gray-500 md:grid-cols-2">
                        <div>上次运行: {formatDateTime(automation.lastRunAt)}</div>
                        <div>下次运行: {formatDateTime(automation.nextRunAt)}</div>
                      </div>
                      {automation.lastError && (
                        <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                          最近错误: {automation.lastError}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
                {automations.length === 0 && (
                  <EmptyCard
                    title="还没有 automation"
                    description="当模型创建 automation 后，这里会展示对应列表。"
                  />
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

const Card: React.FC<{
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, actions, children }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="text-xs text-gray-400">{subtitle}</div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
    {children}
  </div>
);

const TagRow: React.FC<{
  label: string;
  values: string[];
  tone?: "blue" | "amber" | "emerald";
}> = ({ label, values, tone = "blue" }) => {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-blue-50 text-blue-700";

  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span key={value} className={`rounded-full px-2 py-1 text-xs ${toneClass}`}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
};

const EmptyCard: React.FC<{
  title: string;
  description: string;
}> = ({ title, description }) => (
  <div className="rounded-2xl border border-dashed border-gray-200 bg-white/80 p-6 text-center">
    <div className="text-sm font-medium text-gray-700">{title}</div>
    <div className="mt-1 text-sm text-gray-500">{description}</div>
  </div>
);

export default AdminPage;
