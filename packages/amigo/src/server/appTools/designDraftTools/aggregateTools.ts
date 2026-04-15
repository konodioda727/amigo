import { defineTool } from "@amigo-llm/backend";
import { resolveDesignDocOwnerTaskId } from "../designDocTools/designDocScope";
import { orchestrateFinalDesignDraftTool, readDraftCritiqueTool } from "./draftTools";
import { readFinalDesignDraftTool } from "./finalDraftTools";
import { readLayoutOptionsTool, upsertLayoutOptionsTool } from "./layoutTools";
import { readDesignSessionTool, upsertDesignSessionTool } from "./sessionTools";
import {
  normalizeId,
  toDraftRenderArtifactHttpDetail,
  toFinalDraftDetail,
  toLayoutDraftOptionHttpDetail,
  toLayoutOptionHttpDetail,
  toThemeOptionDetail,
} from "./shared";
import {
  readStoredDesignSession,
  readStoredFinalDesignDraft,
  readStoredLatestDraftCritique,
  readStoredLatestDraftRenderArtifact,
  readStoredLayoutDraftOptions,
  readStoredLayoutOptions,
  readStoredThemeOptions,
  setStoredSelectedLayoutId,
  setStoredSelectedThemeId,
} from "./storage";
import { readThemeOptionsTool, upsertThemeOptionsTool } from "./themeTools";

const withAction = <T extends Record<string, unknown>>(toolResult: T, action: string) => ({
  ...toolResult,
  action,
});

const withKindAndAction = <T extends Record<string, unknown>>(
  toolResult: T,
  kind: "layout" | "theme",
  action: string,
) => ({
  ...toolResult,
  kind,
  action,
});

const buildLayoutOptionsResult = (taskId: string, action: "read" | "select") => {
  const session = readStoredDesignSession(taskId);
  const options = readStoredLayoutOptions(taskId).map((option) =>
    toLayoutOptionHttpDetail(taskId, option),
  );
  const draftOptions = readStoredLayoutDraftOptions(taskId).map(toLayoutDraftOptionHttpDetail);
  const message =
    action === "select"
      ? session?.selectedLayoutId
        ? `已选择布局方案 ${session.selectedLayoutId}`
        : "布局选择已更新"
      : options.length > 0
        ? `已读取 ${options.length} 个布局方案`
        : "当前还没有布局方案";

  return {
    success: true,
    options,
    draftOptions,
    modules: session?.modules || [],
    selectedLayoutId: session?.selectedLayoutId || null,
    validationErrors: [] as string[],
    message,
  };
};

const buildThemeOptionsResult = (taskId: string, action: "read" | "select") => {
  const session = readStoredDesignSession(taskId);
  const options = readStoredThemeOptions(taskId).map(toThemeOptionDetail);
  const message =
    action === "select"
      ? session?.selectedThemeId
        ? `已选择主题方案 ${session.selectedThemeId}`
        : "主题选择已更新"
      : options.length > 0
        ? `已读取 ${options.length} 个主题方案`
        : "当前还没有主题方案";

  return {
    success: true,
    options,
    selectedThemeId: session?.selectedThemeId || null,
    validationErrors: [] as string[],
    message,
  };
};

export const designSessionTool = defineTool<string>({
  name: "designSession",
  description: "读取或更新当前任务的设计会话，包括页面目标、用户、模块和设计约束。",
  whenToUse:
    "需要建立或查看设计 brief 时使用。先用 action=read 看当前状态；需要补全页面目标、模块、风格关键词和约束时用 action=update。",
  params: [
    { name: "action", optional: false, description: "read 或 update" },
    { name: "pageGoal", optional: true, description: "页面目标" },
    { name: "targetAudience", optional: true, description: "目标用户" },
    { name: "brandMood", optional: true, description: "品牌气质" },
    { name: "styleKeywords", optional: true, description: "风格关键词数组", type: "array" },
    { name: "references", optional: true, description: "参考链接或备注数组", type: "array" },
    { name: "constraints", optional: true, description: "设计约束数组", type: "array" },
    { name: "antiGoals", optional: true, description: "反例和禁区数组", type: "array" },
    { name: "modules", optional: true, description: "页面模块数组", type: "array" },
  ],
  async invoke({ params, context }) {
    const action = params.action === "update" ? "update" : "read";
    const response =
      action === "update"
        ? await upsertDesignSessionTool.invoke({
            params: {
              pageGoal: params.pageGoal,
              targetAudience: params.targetAudience,
              brandMood: params.brandMood,
              styleKeywords: params.styleKeywords,
              references: params.references,
              constraints: params.constraints,
              antiGoals: params.antiGoals,
              modules: params.modules,
            },
            context,
          })
        : await readDesignSessionTool.invoke({ params: {}, context });

    return {
      ...response,
      toolResult: withAction(response.toolResult as Record<string, unknown>, action),
    };
  },
});

export const designOptionsTool = defineTool<string>({
  name: "designOptions",
  description: "统一读取、生成、更新和选择布局或主题方案。",
  whenToUse:
    "布局和主题阶段都通过这个工具处理。kind=layout 或 theme；action=read/generate/update/select。",
  params: [
    { name: "kind", optional: false, description: "layout 或 theme" },
    { name: "action", optional: false, description: "read、generate、update 或 select" },
    { name: "options", optional: true, description: "候选方案数组", type: "array" },
    { name: "layoutId", optional: true, description: "要选择的布局 ID" },
    { name: "themeId", optional: true, description: "要选择的主题 ID" },
  ],
  async invoke({ params, context }) {
    const kind = params.kind === "theme" ? "theme" : "layout";
    const action =
      params.action === "generate" ||
      params.action === "update" ||
      params.action === "select" ||
      params.action === "read"
        ? params.action
        : "read";

    if (kind === "layout") {
      if (action === "read") {
        const response = await readLayoutOptionsTool.invoke({ params: {}, context });
        return {
          ...response,
          toolResult: withKindAndAction(
            response.toolResult as Record<string, unknown>,
            "layout",
            "read",
          ),
        };
      }

      if (action === "generate" || action === "update") {
        const response = await upsertLayoutOptionsTool.invoke({
          params: { options: params.options },
          context,
        });
        return {
          ...response,
          toolResult: withKindAndAction(
            response.toolResult as Record<string, unknown>,
            "layout",
            action,
          ),
        };
      }

      const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
      const layoutId = typeof params.layoutId === "string" ? normalizeId(params.layoutId) : "";
      if (!ownerTaskId || !layoutId) {
        const message = !layoutId ? "layoutId 不能为空" : "taskId 不能为空";
        return {
          message,
          error: message,
          toolResult: withKindAndAction(
            {
              success: false,
              options: [],
              draftOptions: [],
              modules: [],
              selectedLayoutId: null,
              validationErrors: [message],
              message,
            },
            "layout",
            "select",
          ),
        };
      }

      const session = readStoredDesignSession(ownerTaskId);
      if (!session) {
        const message = "请先创建 design session";
        return {
          message,
          error: message,
          toolResult: withKindAndAction(
            {
              success: false,
              options: [],
              draftOptions: [],
              modules: [],
              selectedLayoutId: null,
              validationErrors: [message],
              message,
            },
            "layout",
            "select",
          ),
        };
      }

      const option = readStoredLayoutOptions(ownerTaskId).find(
        (item) => item.layoutId === layoutId,
      );
      if (!option) {
        const message = `未找到布局方案 ${layoutId}`;
        return {
          message,
          error: message,
          toolResult: withKindAndAction(
            {
              success: false,
              options: [],
              draftOptions: [],
              modules: session.modules,
              selectedLayoutId: session.selectedLayoutId || null,
              validationErrors: [message],
              message,
            },
            "layout",
            "select",
          ),
        };
      }

      setStoredSelectedLayoutId(ownerTaskId, layoutId);
      const toolResult = buildLayoutOptionsResult(ownerTaskId, "select");
      return {
        message: toolResult.message,
        toolResult: withKindAndAction(toolResult, "layout", "select"),
      };
    }

    if (action === "read") {
      const response = await readThemeOptionsTool.invoke({ params: {}, context });
      return {
        ...response,
        toolResult: withKindAndAction(
          response.toolResult as Record<string, unknown>,
          "theme",
          "read",
        ),
      };
    }

    if (action === "generate" || action === "update") {
      const response = await upsertThemeOptionsTool.invoke({
        params: { options: params.options },
        context,
      });
      return {
        ...response,
        toolResult: withKindAndAction(
          response.toolResult as Record<string, unknown>,
          "theme",
          action,
        ),
      };
    }

    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    const themeId = typeof params.themeId === "string" ? normalizeId(params.themeId) : "";
    if (!ownerTaskId || !themeId) {
      const message = !themeId ? "themeId 不能为空" : "taskId 不能为空";
      return {
        message,
        error: message,
        toolResult: withKindAndAction(
          {
            success: false,
            options: [],
            selectedThemeId: null,
            validationErrors: [message],
            message,
          },
          "theme",
          "select",
        ),
      };
    }

    const session = readStoredDesignSession(ownerTaskId);
    if (!session) {
      const message = "请先创建 design session";
      return {
        message,
        error: message,
        toolResult: withKindAndAction(
          {
            success: false,
            options: [],
            selectedThemeId: null,
            validationErrors: [message],
            message,
          },
          "theme",
          "select",
        ),
      };
    }

    if (!session.selectedLayoutId) {
      const message = "请先选择布局方案";
      return {
        message,
        error: message,
        toolResult: withKindAndAction(
          {
            success: false,
            options: readStoredThemeOptions(ownerTaskId).map(toThemeOptionDetail),
            selectedThemeId: session.selectedThemeId || null,
            validationErrors: [message],
            message,
          },
          "theme",
          "select",
        ),
      };
    }

    const option = readStoredThemeOptions(ownerTaskId).find((item) => item.themeId === themeId);
    if (!option) {
      const message = `未找到主题方案 ${themeId}`;
      return {
        message,
        error: message,
        toolResult: withKindAndAction(
          {
            success: false,
            options: readStoredThemeOptions(ownerTaskId).map(toThemeOptionDetail),
            selectedThemeId: session.selectedThemeId || null,
            validationErrors: [message],
            message,
          },
          "theme",
          "select",
        ),
      };
    }

    setStoredSelectedThemeId(ownerTaskId, themeId);
    const toolResult = buildThemeOptionsResult(ownerTaskId, "select");
    return {
      message: toolResult.message,
      toolResult: withKindAndAction(toolResult, "theme", "select"),
    };
  },
});

export const designDraftTool = defineTool<string>({
  name: "designDraft",
  description: "统一生成、读取、查看状态和评审最终设计稿。",
  whenToUse:
    "布局和主题都确定后，用 action=generate 或 revise 触发整页草稿生成；需要查看结果时用 action=read、status 或 critique。",
  params: [
    { name: "action", optional: false, description: "generate、read、status、critique 或 revise" },
    { name: "draftId", optional: false, description: "最终草稿 ID" },
    { name: "title", optional: true, description: "最终草稿标题" },
    { name: "iterationGoal", optional: true, description: "本轮迭代目标" },
    {
      name: "regenerateModules",
      optional: true,
      description: "需要重做的模块 ID 数组",
      type: "array",
    },
  ],
  async invoke({ params, context }) {
    const action =
      params.action === "generate" ||
      params.action === "read" ||
      params.action === "status" ||
      params.action === "critique" ||
      params.action === "revise"
        ? params.action
        : "read";

    if (action === "generate" || action === "revise") {
      const response = await orchestrateFinalDesignDraftTool.invoke({
        params: {
          draftId: params.draftId,
          title: params.title,
          iterationGoal: params.iterationGoal,
          regenerateModules: params.regenerateModules,
        },
        context,
      });
      return {
        ...response,
        toolResult: withAction(response.toolResult as Record<string, unknown>, action),
      };
    }

    if (action === "read") {
      const response = await readFinalDesignDraftTool.invoke({
        params: { draftId: params.draftId },
        context,
      });
      return {
        ...response,
        toolResult: withAction(response.toolResult as Record<string, unknown>, "read"),
      };
    }

    if (action === "critique") {
      const response = await readDraftCritiqueTool.invoke({
        params: { draftId: params.draftId },
        context,
      });
      return {
        ...response,
        toolResult: withAction(response.toolResult as Record<string, unknown>, "critique"),
      };
    }

    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    const draftId = typeof params.draftId === "string" ? normalizeId(params.draftId) : "";
    if (!ownerTaskId || !draftId) {
      const message = !draftId ? "draftId 不能为空" : "taskId 不能为空";
      return {
        message,
        error: message,
        toolResult: withAction(
          {
            success: false,
            taskId: ownerTaskId || "",
            draftId,
            draft: null,
            critique: null,
            render: null,
            validationErrors: [message],
            message,
          },
          "status",
        ),
      };
    }

    const draft = readStoredFinalDesignDraft(ownerTaskId, draftId);
    const critique = readStoredLatestDraftCritique(ownerTaskId, draftId);
    const render = readStoredLatestDraftRenderArtifact(ownerTaskId, draftId);
    const message = draft ? `已读取最终设计稿状态 ${draftId}` : `未找到最终界面草稿 ${draftId}`;

    return {
      message,
      ...(draft ? {} : { error: message }),
      toolResult: withAction(
        {
          success: Boolean(draft),
          taskId: ownerTaskId,
          draftId,
          draft: draft ? toFinalDraftDetail(ownerTaskId, draft) : null,
          critique,
          render: render ? toDraftRenderArtifactHttpDetail(ownerTaskId, render) : null,
          validationErrors: draft ? [] : [message],
          message,
        },
        "status",
      ),
    };
  },
});
