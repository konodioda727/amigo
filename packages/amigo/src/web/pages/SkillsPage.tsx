import { useWebSocketContext } from "@amigo-llm/frontend";
import { Check, Loader2, Pencil, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  browseSkillMarket,
  deleteSkill,
  getSkill,
  importSkillFromMarket,
  listSkills,
  type SkillMarketItem,
  type SkillSummary,
  type SkillUpsertInput,
  searchSkillMarket,
  upsertSkill,
} from "@/utils/serverAdmin";
import { toast } from "@/utils/toast";

type SkillFormState = {
  id: string;
  skillMarkdown: string;
};

type SkillView = "installed" | "all";

const emptySkillForm: SkillFormState = {
  id: "",
  skillMarkdown: `---
name: new-skill
description: Describe exactly when this skill should be used and what workflow it provides.
---

# New Skill

## When to use

Describe the trigger phrases, scenarios, and constraints.

## Workflow

List the repeatable steps Claude should follow.
`,
};

const includesQuery = (value: string, query: string): boolean =>
  value.toLowerCase().includes(query.trim().toLowerCase());

const SkillsPage: React.FC = () => {
  const { config } = useWebSocketContext();
  const [installedSkills, setInstalledSkills] = useState<SkillSummary[]>([]);
  const [marketSkills, setMarketSkills] = useState<SkillMarketItem[]>([]);
  const [marketQuery, setMarketQuery] = useState("");
  const [activeView, setActiveView] = useState<SkillView>("all");
  const [isLoadingInstalled, setIsLoadingInstalled] = useState(true);
  const [isLoadingMarket, setIsLoadingMarket] = useState(true);
  const [isSavingSkill, setIsSavingSkill] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [skillForm, setSkillForm] = useState<SkillFormState>(emptySkillForm);
  const [importingSkillId, setImportingSkillId] = useState<string | null>(null);

  const sortedInstalledSkills = useMemo(
    () => [...installedSkills].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [installedSkills],
  );
  const installedSkillIds = useMemo(
    () => new Set(sortedInstalledSkills.map((skill) => skill.id)),
    [sortedInstalledSkills],
  );
  const filteredInstalledSkills = useMemo(() => {
    const query = marketQuery.trim().toLowerCase();
    if (!query) {
      return sortedInstalledSkills;
    }
    return sortedInstalledSkills.filter((skill) =>
      includesQuery(`${skill.name} ${skill.id} ${skill.description}`, query),
    );
  }, [marketQuery, sortedInstalledSkills]);
  const isLoadingList = activeView === "installed" ? isLoadingInstalled : isLoadingMarket;

  const loadInstalledSkills = useCallback(async () => {
    setIsLoadingInstalled(true);
    try {
      setInstalledSkills(await listSkills(config.url));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingInstalled(false);
    }
  }, [config.url]);

  const loadMarket = useCallback(
    async (query = "") => {
      setIsLoadingMarket(true);
      try {
        const nextSkills = query.trim()
          ? await searchSkillMarket(config.url, { query: query.trim(), limit: 24 })
          : await browseSkillMarket(config.url, { limit: 24, sort: "score" });
        setMarketSkills(nextSkills);
      } catch (error) {
        setMarketSkills([]);
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setIsLoadingMarket(false);
      }
    },
    [config.url],
  );

  useEffect(() => {
    void Promise.all([loadInstalledSkills(), loadMarket("")]);
  }, [loadInstalledSkills, loadMarket]);

  const handleSearch = () => {
    void loadMarket(marketQuery);
  };

  const handleRefresh = () => {
    void Promise.all([loadInstalledSkills(), loadMarket(marketQuery)]);
  };

  const handleSkillSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!skillForm.skillMarkdown.trim()) {
      toast.error("请填写 SKILL.md");
      return;
    }

    const payload: SkillUpsertInput = {
      ...(skillForm.id.trim() ? { id: skillForm.id.trim() } : {}),
      skillMarkdown: skillForm.skillMarkdown.trim(),
    };

    setIsSavingSkill(true);
    try {
      const savedSkill = await upsertSkill(config.url, payload);
      setInstalledSkills((prev) => {
        const next = prev.filter((skill) => skill.id !== savedSkill.id);
        const { skillMarkdown: _skillMarkdown, ...summary } = savedSkill;
        next.push(summary);
        return next;
      });
      setSkillForm(emptySkillForm);
      setIsEditorOpen(false);
      toast.success(`skill 已保存: ${savedSkill.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingSkill(false);
    }
  };

  const handleCreateSkill = () => {
    setSkillForm(emptySkillForm);
    setIsEditorOpen(true);
  };

  const handleEditSkill = async (skillId: string) => {
    try {
      const skill = await getSkill(config.url, skillId);
      setSkillForm({
        id: skill.id,
        skillMarkdown: skill.skillMarkdown,
      });
      setIsEditorOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    if (!window.confirm(`确定删除 skill ${skillId} 吗？`)) {
      return;
    }

    try {
      await deleteSkill(config.url, skillId);
      setInstalledSkills((prev) => prev.filter((skill) => skill.id !== skillId));
      toast.success(`skill 已删除: ${skillId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleImportSkill = async (skill: SkillMarketItem) => {
    setImportingSkillId(skill.id);
    try {
      const savedSkill = await importSkillFromMarket(config.url, {
        id: skill.id,
        slug: skill.slug,
        name: skill.name,
        detailUrl: skill.detailUrl,
      });
      setInstalledSkills((prev) => {
        const next = prev.filter((item) => item.id !== savedSkill.id);
        const { skillMarkdown: _skillMarkdown, ...summary } = savedSkill;
        next.push(summary);
        return next;
      });
      toast.success(`已导入 skill: ${savedSkill.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setImportingSkillId(null);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-neutral-50/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-neutral-50 px-3 py-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                value={marketQuery}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setMarketQuery(nextValue);
                  if (!nextValue.trim()) {
                    void loadMarket("");
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder="搜索 skill"
                className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSearch}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                搜索
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4" />
                刷新
              </button>
              <button
                type="button"
                onClick={handleCreateSkill}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" />
                新建
              </button>
              <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={isEditorOpen}
                  onChange={(event) => {
                    setIsEditorOpen(event.target.checked);
                    if (!event.target.checked) {
                      setSkillForm(emptySkillForm);
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                手动编辑
              </label>
            </div>
          </div>
        </section>

        {isEditorOpen && (
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <form className="space-y-3" onSubmit={handleSkillSubmit}>
              <Field label="ID">
                <input
                  value={skillForm.id}
                  onChange={(event) =>
                    setSkillForm((prev) => ({ ...prev, id: event.target.value }))
                  }
                  placeholder="frontend-design"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400"
                />
              </Field>
              <Field label="SKILL.md">
                <textarea
                  value={skillForm.skillMarkdown}
                  onChange={(event) =>
                    setSkillForm((prev) => ({ ...prev, skillMarkdown: event.target.value }))
                  }
                  rows={14}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm leading-6 text-gray-900 outline-none transition focus:border-blue-400"
                />
              </Field>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSavingSkill}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {isSavingSkill ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setSkillForm(emptySkillForm)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  清空
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-gray-200 bg-neutral-50 p-1">
              <button
                type="button"
                onClick={() => setActiveView("installed")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeView === "installed"
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                已安装
              </button>
              <button
                type="button"
                onClick={() => setActiveView("all")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeView === "all"
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                全部
              </button>
            </div>
          </div>

          {isLoadingList ? (
            <LoadingState />
          ) : activeView === "installed" ? (
            filteredInstalledSkills.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredInstalledSkills.map((skill) => (
                  <SkillTile
                    key={skill.id}
                    name={skill.name}
                    meta={skill.id}
                    state="installed"
                    actions={
                      <>
                        <IconButton title="编辑" onClick={() => void handleEditSkill(skill.id)}>
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          title="删除"
                          tone="danger"
                          onClick={() => void handleDeleteSkill(skill.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </>
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState label="没有匹配的已安装 skill" />
            )
          ) : marketSkills.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {marketSkills.map((skill) => {
                const installed =
                  installedSkillIds.has(skill.slug) || installedSkillIds.has(skill.id);
                const meta = skill.author ? `${skill.slug} · ${skill.author}` : skill.slug;
                return (
                  <SkillTile
                    key={skill.id}
                    name={skill.name}
                    meta={meta}
                    state={installed ? "installed" : "default"}
                    actions={
                      installed ? (
                        <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                          <Check className="h-4 w-4" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleImportSkill(skill)}
                          disabled={importingSkillId === skill.id}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                        >
                          {importingSkillId === skill.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          安装
                        </button>
                      )
                    }
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState label={marketQuery.trim() ? "没有搜索结果" : "没有可展示的 skill"} />
          )}
        </section>
      </div>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="space-y-1.5">
    <div className="text-xs font-medium text-gray-500">{label}</div>
    {children}
  </div>
);

const IconButton: React.FC<{
  title: string;
  children: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}> = ({ title, children, onClick, tone = "default" }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
      tone === "danger"
        ? "border-red-200 text-red-600 hover:bg-red-50"
        : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`}
  >
    {children}
  </button>
);

const SkillTile: React.FC<{
  name: string;
  meta: string;
  state?: "default" | "installed";
  actions: React.ReactNode;
}> = ({ name, meta, state = "default", actions }) => (
  <div
    className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
      state === "installed" ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-white"
    }`}
  >
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-semibold text-gray-900">{name}</div>
      <div className="mt-1 truncate text-xs text-gray-500">{meta}</div>
    </div>
    <div className="flex shrink-0 items-center gap-2">{actions}</div>
  </div>
);

const LoadingState: React.FC = () => (
  <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 px-4 py-12 text-sm text-gray-500">
    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
    加载中...
  </div>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="rounded-xl border border-dashed border-gray-200 px-4 py-12 text-center text-sm text-gray-500">
    {label}
  </div>
);

export default SkillsPage;
