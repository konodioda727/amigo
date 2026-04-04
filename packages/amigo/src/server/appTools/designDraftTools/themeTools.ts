import { defineTool } from "@amigo-llm/backend";
import { resolveDesignDocOwnerTaskId } from "../designDocTools/designDocScope";
import { normalizeId, parseThemeTokens, type ThemeOption, toThemeOptionDetail } from "./shared";
import {
  readStoredDesignSession,
  readStoredThemeOptions,
  upsertStoredThemeOptions,
} from "./storage";

const createThemeOptionRecord = (
  input: Record<string, unknown>,
  existing?: ThemeOption,
): ThemeOption | null => {
  const themeId = typeof input.themeId === "string" ? normalizeId(input.themeId) : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const tokens = parseThemeTokens(input.tokens);
  if (!themeId || !title || !tokens) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    themeId,
    title,
    description: typeof input.description === "string" ? input.description.trim() : "",
    tokens,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
};

export const readThemeOptionsTool = defineTool({
  name: "readThemeOptions",
  description: "读取当前任务下的主题方案和已选主题。",
  whenToUse: "主题探索前后读取当前主题方案，确认主题系统选择。",
  params: [],
  async invoke({ context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          options: [],
          selectedThemeId: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const session = readStoredDesignSession(ownerTaskId);
    const options = readStoredThemeOptions(ownerTaskId).map(toThemeOptionDetail);
    const message =
      options.length > 0 ? `已读取 ${options.length} 个主题方案` : "当前还没有主题方案";
    return {
      message,
      toolResult: {
        success: true,
        options,
        selectedThemeId: session?.selectedThemeId || null,
        validationErrors: [],
        message,
      },
    };
  },
});

export const upsertThemeOptionsTool = defineTool({
  name: "upsertThemeOptions",
  description: "写入 2-3 个主题方案。主题方案必须提供完整 token，并面向统一测试模块展示。",
  whenToUse:
    "在已选布局基础上，产出 2-3 个主题方案，让用户通过同一组按钮、表单、卡片、标签的 demo 模块做选择。",
  completionBehavior: "idle",
  params: [
    {
      name: "options",
      optional: false,
      type: "array",
      description: "主题方案数组，建议一次提供 3 个方向。",
      params: [
        {
          name: "option",
          optional: false,
          description: "单个主题方案",
          type: "object",
          params: [
            { name: "themeId", optional: false, description: "主题 ID，推荐 kebab-case" },
            { name: "title", optional: false, description: "主题标题" },
            { name: "description", optional: true, description: "主题说明" },
            {
              name: "tokens",
              optional: false,
              description: "完整主题 token 集合",
              type: "object",
              params: [
                { name: "background", optional: false, description: "页面背景色" },
                { name: "surface", optional: false, description: "主表面色" },
                { name: "surfaceAlt", optional: false, description: "次级表面色" },
                { name: "textPrimary", optional: false, description: "主文字色" },
                { name: "textSecondary", optional: false, description: "次文字色" },
                { name: "border", optional: false, description: "边框色" },
                { name: "primary", optional: false, description: "主按钮色" },
                { name: "primaryText", optional: false, description: "主按钮文字色" },
                { name: "accent", optional: false, description: "强调色" },
                { name: "accentText", optional: false, description: "强调色文字" },
                { name: "danger", optional: false, description: "危险色" },
                { name: "success", optional: false, description: "成功色" },
                { name: "warning", optional: false, description: "警告色" },
                { name: "radius", optional: false, description: "圆角 token" },
                { name: "shadow", optional: false, description: "阴影 token" },
              ],
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
        error: message,
        toolResult: {
          success: false,
          options: [],
          selectedThemeId: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const session = readStoredDesignSession(ownerTaskId);
    if (!session?.selectedLayoutId) {
      const message = "请先选择布局方案，再生成主题方案";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          options: [],
          selectedThemeId: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const existingMap = new Map(
      readStoredThemeOptions(ownerTaskId).map((option) => [option.themeId, option]),
    );
    const options = Array.isArray(params.options)
      ? params.options
          .map((item) =>
            item && typeof item === "object"
              ? createThemeOptionRecord(
                  item as Record<string, unknown>,
                  existingMap.get(
                    typeof (item as Record<string, unknown>).themeId === "string"
                      ? normalizeId((item as Record<string, unknown>).themeId as string)
                      : "",
                  ),
                )
              : null,
          )
          .filter((item): item is ThemeOption => Boolean(item))
      : [];

    if (options.length === 0) {
      const message = "options 至少要包含一个合法主题方案";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          options: [],
          selectedThemeId: null,
          validationErrors: [message],
          message,
        },
      };
    }

    upsertStoredThemeOptions(ownerTaskId, options);
    return {
      message: `已更新 ${options.length} 个主题方案`,
      toolResult: {
        success: true,
        options: options.map(toThemeOptionDetail),
        selectedThemeId: null,
        validationErrors: [],
        message: `已更新 ${options.length} 个主题方案`,
      },
    };
  },
});
