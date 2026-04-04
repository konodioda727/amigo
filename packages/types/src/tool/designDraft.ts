import { z } from "zod";

const ValidationErrorsSchema = z.array(z.string()).describe("校验错误列表");

const DesignModuleSchema = z.object({
  id: z.string().describe("模块 ID"),
  label: z.string().describe("模块名称"),
  summary: z.string().describe("模块作用说明"),
  priority: z.enum(["primary", "secondary", "support"]).describe("模块优先级"),
});

const DesignSessionSchema = z.object({
  pageGoal: z.string().describe("页面目标"),
  targetAudience: z.string().describe("目标用户"),
  brandMood: z.string().describe("品牌气质"),
  styleKeywords: z.array(z.string()).describe("风格关键词"),
  references: z.array(z.string()).describe("参考链接或备注"),
  constraints: z.array(z.string()).describe("设计约束"),
  antiGoals: z.array(z.string()).describe("反例和禁区"),
  modules: z.array(DesignModuleSchema).describe("页面模块列表"),
  selectedLayoutId: z.string().nullable().describe("已选布局 ID"),
  selectedThemeId: z.string().nullable().describe("已选主题 ID"),
  createdAt: z.string().describe("创建时间"),
  updatedAt: z.string().describe("更新时间"),
});

const LayoutOptionSchema = z.object({
  layoutId: z.string().describe("布局 ID"),
  title: z.string().describe("布局标题"),
  description: z.string().describe("布局说明"),
  source: z
    .string()
    .describe("HTML 布局骨架源码，使用 data-module-id 标出各业务区域，只保留结构，不输出视觉细节"),
  moduleIds: z.array(z.string()).describe("该布局覆盖的模块 ID，必须覆盖全部模块"),
  canvasWidth: z.number().describe("布局画布宽度"),
  canvasHeight: z.number().describe("布局画布高度"),
  createdAt: z.string().describe("创建时间"),
  updatedAt: z.string().describe("更新时间"),
});

const LayoutDraftOptionSchema = z.object({
  layoutId: z.string().describe("布局草稿 ID"),
  title: z.string().describe("布局草稿标题"),
  description: z.string().describe("布局草稿说明"),
  source: z.string().describe("布局草稿源码"),
  moduleIds: z.array(z.string()).describe("草稿中识别出的模块 ID"),
  canvasWidth: z.number().describe("布局草稿画布宽度"),
  canvasHeight: z.number().describe("布局草稿画布高度"),
  createdAt: z.string().describe("创建时间"),
  updatedAt: z.string().describe("更新时间"),
  validationErrors: z.array(z.string()).describe("该布局草稿当前存在的校验错误"),
});

const ThemeTokensSchema = z.object({
  background: z.string().describe("页面背景色"),
  surface: z.string().describe("主表面色"),
  surfaceAlt: z.string().describe("次级表面色"),
  textPrimary: z.string().describe("主文字色"),
  textSecondary: z.string().describe("次文字色"),
  border: z.string().describe("边框色"),
  primary: z.string().describe("主按钮色"),
  primaryText: z.string().describe("主按钮文字色"),
  accent: z.string().describe("强调色"),
  accentText: z.string().describe("强调色文字"),
  danger: z.string().describe("危险色"),
  success: z.string().describe("成功色"),
  warning: z.string().describe("警告色"),
  radius: z.string().describe("圆角 token"),
  shadow: z.string().describe("阴影 token"),
});

const ThemeOptionSchema = z.object({
  themeId: z.string().describe("主题 ID"),
  title: z.string().describe("主题标题"),
  description: z.string().describe("主题说明"),
  tokens: ThemeTokensSchema.describe("主题 token"),
  createdAt: z.string().describe("创建时间"),
  updatedAt: z.string().describe("更新时间"),
});

const FinalDesignDraftSummarySchema = z.object({
  draftId: z.string().describe("最终草稿 ID"),
  title: z.string().describe("最终草稿标题"),
  status: z.enum(["draft", "approved"]).describe("草稿状态"),
  basedOnLayoutId: z.string().describe("来源布局 ID"),
  basedOnThemeId: z.string().describe("来源主题 ID"),
  revision: z.number().int().nonnegative().describe("草稿修订版本"),
  updatedAt: z.string().describe("更新时间"),
  previewPath: z.string().describe("预览路径"),
});

const FinalDesignDraftSchema = FinalDesignDraftSummarySchema.extend({
  notes: z.string().nullable().describe("草稿备注"),
  content: z.string().describe("HTML + Tailwind 最终界面"),
  createdAt: z.string().describe("创建时间"),
  revision: z.number().int().nonnegative().describe("草稿修订版本"),
});

const ModuleDraftSchema = z.object({
  draftId: z.string().describe("所属最终草稿 ID"),
  moduleId: z.string().describe("模块 ID"),
  title: z.string().describe("模块标题"),
  html: z.string().describe("模块 HTML 片段"),
  notes: z.string().nullable().describe("模块备注"),
  assetsUsed: z.array(z.string()).describe("使用的资产 ID 列表"),
  copySummary: z.string().describe("文案摘要"),
  status: z.enum(["draft", "revised", "accepted"]).describe("模块状态"),
  createdAt: z.string().describe("创建时间"),
  updatedAt: z.string().describe("更新时间"),
});

const ModuleDraftDetailSchema = ModuleDraftSchema.extend({
  previewPath: z.string().describe("模块预览路径"),
});

const DraftRenderArtifactSchema = z.object({
  draftId: z.string().describe("所属最终草稿 ID"),
  revision: z.number().int().nonnegative().describe("草稿修订版本"),
  deviceMode: z.enum(["desktop", "mobile"]).describe("截图设备模式"),
  status: z.enum(["disabled", "skipped", "captured", "failed"]).describe("截图状态"),
  imagePath: z.string().nullable().describe("站内图片访问路径"),
  publicImageUrl: z.string().nullable().describe("可公开访问的图片 URL"),
  capturedAt: z.string().nullable().describe("截图时间"),
  message: z.string().describe("截图结果说明"),
});

const DraftCritiqueIssueSchema = z.object({
  scope: z.enum(["global", "module"]).describe("问题作用域"),
  moduleId: z.string().nullable().describe("模块 ID"),
  severity: z.enum(["low", "medium", "high"]).describe("问题严重级别"),
  title: z.string().describe("问题标题"),
  detail: z.string().describe("问题说明"),
  recommendation: z.string().describe("建议修正方式"),
});

const DraftCritiqueSchema = z.object({
  draftId: z.string().describe("所属最终草稿 ID"),
  revision: z.number().int().nonnegative().describe("草稿修订版本"),
  summary: z.string().describe("整体评审摘要"),
  autoFixedModuleIds: z.array(z.string()).describe("本轮自动返工过的模块 ID"),
  issues: z.array(DraftCritiqueIssueSchema).describe("结构化问题列表"),
  createdAt: z.string().describe("评审创建时间"),
});

export const ReadDesignSessionSchema = z.object({
  name: z.literal("readDesignSession"),
  params: z.object({}).describe("读取设计会话的参数"),
  result: z.object({
    success: z.boolean(),
    session: DesignSessionSchema.nullable(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export const UpsertDesignSessionSchema = z.object({
  name: z.literal("upsertDesignSession"),
  params: z.object({
    pageGoal: z.string().describe("页面目标"),
    targetAudience: z.string().describe("目标用户"),
    brandMood: z.string().describe("品牌气质"),
    styleKeywords: z.array(z.string()).optional().describe("风格关键词"),
    references: z.array(z.string()).optional().describe("参考链接或备注"),
    constraints: z.array(z.string()).optional().describe("设计约束"),
    antiGoals: z.array(z.string()).optional().describe("反例和禁区"),
    modules: z.array(DesignModuleSchema).min(1).describe("页面模块列表"),
  }),
  result: z.object({
    success: z.boolean(),
    session: DesignSessionSchema.nullable(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export const ReadLayoutOptionsSchema = z.object({
  name: z.literal("readLayoutOptions"),
  params: z.object({}),
  result: z.object({
    success: z.boolean(),
    options: z.array(LayoutOptionSchema),
    draftOptions: z.array(LayoutDraftOptionSchema),
    modules: z.array(DesignModuleSchema),
    selectedLayoutId: z.string().nullable(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export const UpsertLayoutOptionsSchema = z.object({
  name: z.literal("upsertLayoutOptions"),
  params: z.object({
    options: z.array(
      z.object({
        layoutId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        source: z.string().optional(),
        content: z.string().optional(),
        startLine: z.number().optional(),
        endLine: z.number().optional(),
        search: z.string().optional(),
        replace: z.string().optional(),
        replaceAll: z.boolean().optional(),
        failIfNoMatch: z.boolean().optional(),
        moduleIds: z.array(z.string()).optional(),
        canvasWidth: z.number().optional(),
        canvasHeight: z.number().optional(),
      }),
    ),
  }),
  result: z.object({
    success: z.boolean(),
    options: z.array(LayoutOptionSchema),
    draftOptions: z.array(LayoutDraftOptionSchema),
    modules: z.array(DesignModuleSchema),
    selectedLayoutId: z.string().nullable(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export const PatchLayoutOptionSourceSchema = z.object({
  name: z.literal("patchLayoutOptionSource"),
  params: z.object({
    layoutId: z.string(),
    content: z.string().optional(),
    startLine: z.number().optional(),
    endLine: z.number().optional(),
    search: z.string().optional(),
    replace: z.string().optional(),
    replaceAll: z.boolean().optional(),
    failIfNoMatch: z.boolean().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    canvasWidth: z.number().optional(),
    canvasHeight: z.number().optional(),
  }),
  result: z.object({
    success: z.boolean(),
    updatedLayoutId: z.string().nullable(),
    options: z.array(LayoutOptionSchema),
    draftOptions: z.array(LayoutDraftOptionSchema),
    modules: z.array(DesignModuleSchema),
    selectedLayoutId: z.string().nullable(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export const ReadThemeOptionsSchema = z.object({
  name: z.literal("readThemeOptions"),
  params: z.object({}),
  result: z.object({
    success: z.boolean(),
    options: z.array(ThemeOptionSchema),
    selectedThemeId: z.string().nullable(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export const UpsertThemeOptionsSchema = z.object({
  name: z.literal("upsertThemeOptions"),
  params: z.object({
    options: z.array(
      z.object({
        themeId: z.string(),
        title: z.string(),
        description: z.string().optional(),
        tokens: ThemeTokensSchema,
      }),
    ),
  }),
  result: z.object({
    success: z.boolean(),
    options: z.array(ThemeOptionSchema),
    selectedThemeId: z.string().nullable(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export const ReadFinalDesignDraftSchema = z.object({
  name: z.literal("readFinalDesignDraft"),
  params: z.object({ draftId: z.string() }),
  result: z.object({
    success: z.boolean(),
    draft: FinalDesignDraftSchema.nullable(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export const ReadModuleDraftsSchema = z.object({
  name: z.literal("readModuleDrafts"),
  params: z.object({ draftId: z.string() }),
  result: z.object({
    success: z.boolean(),
    taskId: z.string(),
    draftId: z.string(),
    modules: z.array(ModuleDraftDetailSchema),
    latestRevision: z.number().int().nonnegative().nullable(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export const UpsertModuleDraftsSchema = z.object({
  name: z.literal("upsertModuleDrafts"),
  params: z.object({
    draftId: z.string(),
    modules: z.array(
      z.object({
        moduleId: z.string(),
        title: z.string(),
        html: z.string(),
        notes: z.string().nullable().optional(),
        assetsUsed: z
          .array(
            z.union([
              z.string(),
              z.object({
                assetId: z.string(),
              }),
            ]),
          )
          .optional(),
        copySummary: z.string().optional(),
        status: z.enum(["draft", "revised", "accepted"]).optional(),
      }),
    ),
  }),
  result: z.object({
    success: z.boolean(),
    taskId: z.string(),
    draftId: z.string(),
    modules: z.array(ModuleDraftDetailSchema),
    latestRevision: z.number().int().nonnegative().nullable(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export const OrchestrateFinalDesignDraftSchema = z.object({
  name: z.literal("orchestrateFinalDesignDraft"),
  params: z.object({
    draftId: z.string(),
    title: z.string(),
    iterationGoal: z.string().optional(),
    regenerateModules: z.array(z.string()).optional(),
  }),
  result: z.object({
    success: z.boolean(),
    taskId: z.string(),
    draftId: z.string(),
    title: z.string(),
    async: z.boolean(),
    status: z.enum(["started", "already_running"]),
    executionId: z.string(),
    startedAt: z.string(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export const ReadDraftCritiqueSchema = z.object({
  name: z.literal("readDraftCritique"),
  params: z.object({ draftId: z.string() }),
  result: z.object({
    success: z.boolean(),
    taskId: z.string(),
    draftId: z.string(),
    critique: DraftCritiqueSchema.nullable(),
    render: DraftRenderArtifactSchema.nullable(),
    validationErrors: ValidationErrorsSchema,
    message: z.string(),
  }),
});

export type ReadDesignSessionParams = z.infer<typeof ReadDesignSessionSchema>["params"];
export type ReadDesignSessionResult = z.infer<typeof ReadDesignSessionSchema>["result"];
export type UpsertDesignSessionParams = z.infer<typeof UpsertDesignSessionSchema>["params"];
export type UpsertDesignSessionResult = z.infer<typeof UpsertDesignSessionSchema>["result"];
export type ReadLayoutOptionsParams = z.infer<typeof ReadLayoutOptionsSchema>["params"];
export type ReadLayoutOptionsResult = z.infer<typeof ReadLayoutOptionsSchema>["result"];
export type UpsertLayoutOptionsParams = z.infer<typeof UpsertLayoutOptionsSchema>["params"];
export type UpsertLayoutOptionsResult = z.infer<typeof UpsertLayoutOptionsSchema>["result"];
export type PatchLayoutOptionSourceParams = z.infer<typeof PatchLayoutOptionSourceSchema>["params"];
export type PatchLayoutOptionSourceResult = z.infer<typeof PatchLayoutOptionSourceSchema>["result"];
export type ReadThemeOptionsParams = z.infer<typeof ReadThemeOptionsSchema>["params"];
export type ReadThemeOptionsResult = z.infer<typeof ReadThemeOptionsSchema>["result"];
export type UpsertThemeOptionsParams = z.infer<typeof UpsertThemeOptionsSchema>["params"];
export type UpsertThemeOptionsResult = z.infer<typeof UpsertThemeOptionsSchema>["result"];
export type ReadFinalDesignDraftParams = z.infer<typeof ReadFinalDesignDraftSchema>["params"];
export type ReadFinalDesignDraftResult = z.infer<typeof ReadFinalDesignDraftSchema>["result"];
export type ReadModuleDraftsParams = z.infer<typeof ReadModuleDraftsSchema>["params"];
export type ReadModuleDraftsResult = z.infer<typeof ReadModuleDraftsSchema>["result"];
export type UpsertModuleDraftsParams = z.infer<typeof UpsertModuleDraftsSchema>["params"];
export type UpsertModuleDraftsResult = z.infer<typeof UpsertModuleDraftsSchema>["result"];
export type OrchestrateFinalDesignDraftParams = z.infer<
  typeof OrchestrateFinalDesignDraftSchema
>["params"];
export type OrchestrateFinalDesignDraftResult = z.infer<
  typeof OrchestrateFinalDesignDraftSchema
>["result"];
export type ReadDraftCritiqueParams = z.infer<typeof ReadDraftCritiqueSchema>["params"];
export type ReadDraftCritiqueResult = z.infer<typeof ReadDraftCritiqueSchema>["result"];
