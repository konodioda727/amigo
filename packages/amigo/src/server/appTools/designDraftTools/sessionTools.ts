import { defineTool } from "@amigo-llm/backend";
import { resolveDesignDocOwnerTaskId } from "../designDocTools/designDocScope";
import { parseDesignModules } from "./shared";
import { readStoredDesignSession, upsertStoredDesignSession } from "./storage";

export const readDesignSessionTool = defineTool({
  name: "readDesignSession",
  description: "读取当前任务的设计会话，包括页面目标、模块列表和已选布局/主题。",
  whenToUse: "开始设计流程前，先读取当前设计会话，确认页面目标、模块和已做过的决策。",
  params: [],
  async invoke({ context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        toolResult: { success: false, session: null, validationErrors: [message], message },
      };
    }

    const session = readStoredDesignSession(ownerTaskId);
    const message = session ? "已读取设计会话" : "当前还没有设计会话";
    return {
      message,
      toolResult: { success: Boolean(session), session, validationErrors: [], message },
    };
  },
});

export const upsertDesignSessionTool = defineTool({
  name: "upsertDesignSession",
  description: "创建或更新设计会话，用于记录页面目标、模块、风格关键词、约束和反例。",
  whenToUse:
    "在布局探索前先写清页面目标、目标用户、模块清单、风格关键词、约束和反例。不要把设计会话写成空泛风格描述。",
  params: [
    {
      name: "pageGoal",
      optional: false,
      description: "页面目标，例如提升转化、强化工作台效率、增强品牌识别。",
    },
    { name: "targetAudience", optional: false, description: "目标用户描述。" },
    { name: "brandMood", optional: false, description: "品牌气质和整体调性描述。" },
    {
      name: "styleKeywords",
      optional: true,
      description: "风格关键词数组",
      type: "array",
      params: [{ name: "keyword", optional: false, description: "单个风格关键词" }],
    },
    {
      name: "references",
      optional: true,
      description: "参考链接或参考备注数组",
      type: "array",
      params: [{ name: "reference", optional: false, description: "单个参考链接或备注" }],
    },
    {
      name: "constraints",
      optional: true,
      description: "设计约束数组",
      type: "array",
      params: [{ name: "constraint", optional: false, description: "单个设计约束" }],
    },
    {
      name: "antiGoals",
      optional: true,
      description: "明确不要出现的风格或方案数组",
      type: "array",
      params: [{ name: "antiGoal", optional: false, description: "单个反例或禁区" }],
    },
    {
      name: "modules",
      optional: false,
      type: "array",
      description: "页面模块列表。要写清每个板块的名称、作用和优先级。",
      params: [
        {
          name: "module",
          optional: false,
          description: "单个页面模块",
          type: "object",
          params: [
            { name: "id", optional: false, description: "模块 ID，推荐 kebab-case" },
            { name: "label", optional: false, description: "模块名称" },
            { name: "summary", optional: true, description: "模块作用说明" },
            {
              name: "priority",
              optional: true,
              description: "优先级，可选 primary / secondary / support",
            },
          ],
        },
      ],
    },
  ],
  async invoke({ params, context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        toolResult: { success: false, session: null, validationErrors: [message], message },
      };
    }

    const pageGoal = typeof params.pageGoal === "string" ? params.pageGoal.trim() : "";
    const targetAudience =
      typeof params.targetAudience === "string" ? params.targetAudience.trim() : "";
    const brandMood = typeof params.brandMood === "string" ? params.brandMood.trim() : "";
    const modules = parseDesignModules(params.modules);
    const validationErrors = [
      !pageGoal ? "pageGoal 不能为空" : "",
      !targetAudience ? "targetAudience 不能为空" : "",
      !brandMood ? "brandMood 不能为空" : "",
      modules.length === 0 ? "modules 至少要有一个模块" : "",
    ].filter(Boolean);

    if (validationErrors.length > 0) {
      const message = validationErrors[0] || "设计会话无效";
      return { message, toolResult: { success: false, session: null, validationErrors, message } };
    }

    const session = upsertStoredDesignSession(ownerTaskId, {
      pageGoal,
      targetAudience,
      brandMood,
      styleKeywords: Array.isArray(params.styleKeywords)
        ? params.styleKeywords
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      references: Array.isArray(params.references)
        ? params.references
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      constraints: Array.isArray(params.constraints)
        ? params.constraints
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      antiGoals: Array.isArray(params.antiGoals)
        ? params.antiGoals
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      modules,
    });

    return {
      message: "已更新设计会话",
      toolResult: { success: true, session, validationErrors: [], message: "已更新设计会话" },
    };
  },
});
