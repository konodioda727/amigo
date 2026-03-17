import { z } from "zod";

const DesignDocAvailableDocSchema = z.object({
  pageId: z.string().describe("设计稿页面标识"),
  title: z.string().nullable().optional().describe("设计稿标题"),
  updatedAt: z.string().nullable().optional().describe("最近更新时间"),
  schemaVersion: z.number().optional().describe("设计稿 schema 版本"),
  valid: z.boolean().optional().describe("设计稿是否通过 schema 校验"),
  penpotBinding: z
    .object({
      fileId: z.string().describe("绑定的 Penpot fileId"),
      penpotPageId: z.string().describe("绑定的 Penpot pageId"),
      fileUrl: z.string().describe("绑定的 Penpot 页面地址"),
    })
    .optional()
    .describe("当前设计稿绑定的 Penpot 页面信息"),
});

const DesignDocSummarySchema = z.object({
  title: z.string().nullable().optional().describe("设计稿标题"),
  pageName: z.string().optional().describe("页面名称"),
  width: z.number().optional().describe("页面宽度"),
  minHeight: z.number().optional().describe("页面最小高度"),
  sectionCount: z.number().optional().describe("区块数量"),
  updatedAt: z.string().optional().describe("最近更新时间"),
});

const DesignDocPenpotBindingSchema = z
  .object({
    fileId: z.string().describe("绑定的 Penpot fileId"),
    penpotPageId: z.string().describe("绑定的 Penpot pageId"),
    fileUrl: z.string().describe("绑定的 Penpot 页面地址"),
  })
  .describe("当前设计稿绑定的 Penpot 页面信息");

const DesignDocValidationErrorsSchema = z.array(z.string()).describe("设计稿校验错误列表");
const DesignAssetBaseSchema = z.object({
  id: z.string().describe("设计资产 id"),
  name: z.string().describe("设计资产名称"),
  description: z.string().nullable().describe("设计资产描述"),
  tags: z.array(z.string()).describe("设计资产标签"),
  updatedAt: z.string().describe("设计资产最近更新时间"),
  thumbnailUrl: z.string().nullable().optional().describe("设计资产缩略图地址"),
});

const DesignImageAssetSummarySchema = DesignAssetBaseSchema.extend({
  type: z.literal("image").describe("设计资产类型"),
  url: z.string().url().describe("图片资产地址"),
  width: z.number().nullable().optional().describe("图片宽度"),
  height: z.number().nullable().optional().describe("图片高度"),
});

const DesignComponentAssetSummarySchema = DesignAssetBaseSchema.extend({
  type: z.literal("component").describe("设计资产类型"),
});

const DesignAssetSummarySchema = z.union([
  DesignImageAssetSummarySchema,
  DesignComponentAssetSummarySchema,
]);

const DesignImageAssetDetailSchema = DesignImageAssetSummarySchema.extend({
  createdAt: z.string().describe("创建时间"),
});

const DesignComponentAssetDetailSchema = DesignComponentAssetSummarySchema.extend({
  markupText: z.string().describe("component 资产的受限 markup 内容"),
  createdAt: z.string().describe("创建时间"),
});

const DesignAssetDetailSchema = z.union([
  DesignImageAssetDetailSchema,
  DesignComponentAssetDetailSchema,
]);

const DesignDocWriteResultSchema = z.object({
  success: z.boolean().describe("操作是否成功"),
  pageId: z.string().describe("设计稿页面标识"),
  title: z.string().nullable().optional().describe("设计稿标题"),
  updatedAt: z.string().optional().describe("最近更新时间"),
  summary: DesignDocSummarySchema.optional().describe("设计稿摘要"),
  penpotSync: z
    .union([
      z.object({
        success: z.literal(true),
        fileUrl: z.string().describe("同步后的 Penpot 文件地址"),
      }),
      z.object({
        success: z.literal(false),
        error: z.string().describe("同步 Penpot 失败原因"),
      }),
    ])
    .optional()
    .describe("Penpot 同步结果"),
  validationErrors: DesignDocValidationErrorsSchema,
  message: z.string().describe("操作结果消息"),
});

export const CreateDesignDocFromMarkupSchema = z.object({
  name: z.literal("createDesignDocFromMarkup"),
  params: z
    .object({
      pageId: z.string().describe("页面或视图标识，推荐 kebab-case"),
      title: z.string().optional().describe("设计稿标题"),
      markupText: z.string().describe("受限 HTML + inline CSS 字符串"),
      update: z.boolean().optional().describe("是否按 section.id 对已有页面做局部更新"),
    })
    .describe("从受限标记生成设计稿的参数"),
  result: DesignDocWriteResultSchema.describe("生成设计稿的结果"),
});

export const ReplaceDesignSectionFromMarkupSchema = z.object({
  name: z.literal("replaceDesignSectionFromMarkup"),
  params: z
    .object({
      pageId: z.string().describe("页面或视图标识，推荐 kebab-case"),
      sectionId: z.string().describe("要替换的区块 id"),
      markupText: z.string().describe("以 <section> 为根节点的受限 HTML + inline CSS 字符串"),
    })
    .describe("用受限标记替换单个设计稿区块的参数"),
  result: DesignDocWriteResultSchema.describe("替换设计稿区块的结果"),
});

export const ReadDesignDocSchema = z.object({
  name: z.literal("readDesignDoc"),
  params: z
    .object({
      pageId: z.string().describe("要读取的页面标识"),
    })
    .describe("读取设计稿的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      pageId: z.string().describe("设计稿页面标识"),
      content: z.string().describe("当前页面的可编辑 markup 设计稿内容"),
      summary: DesignDocSummarySchema.optional().describe("设计稿摘要"),
      penpotBinding: DesignDocPenpotBindingSchema.optional(),
      validationErrors: DesignDocValidationErrorsSchema,
      message: z.string().describe("操作结果消息"),
    })
    .describe("读取设计稿的结果"),
});

export const ListDesignDocsSchema = z.object({
  name: z.literal("listDesignDocs"),
  params: z.object({}).describe("列出设计稿的参数"),
  result: z.object({
    success: z.boolean().describe("操作是否成功"),
    availableDocs: z.array(DesignDocAvailableDocSchema).describe("当前任务下可用的设计稿索引"),
    validationErrors: DesignDocValidationErrorsSchema,
    message: z.string().describe("操作结果消息"),
  }),
});

export const ListDesignAssetsSchema = z.object({
  name: z.literal("listDesignAssets"),
  params: z.object({}).describe("列出设计资产的参数"),
  result: z.object({
    success: z.boolean().describe("操作是否成功"),
    assets: z.array(DesignAssetSummarySchema).describe("当前任务下的设计资产列表"),
    validationErrors: DesignDocValidationErrorsSchema,
    message: z.string().describe("操作结果消息"),
  }),
});

export const ReadDesignAssetSchema = z.object({
  name: z.literal("readDesignAsset"),
  params: z
    .object({
      assetId: z.string().describe("要读取的设计资产 id"),
    })
    .describe("读取设计资产的参数"),
  result: z.object({
    success: z.boolean().describe("操作是否成功"),
    asset: DesignAssetDetailSchema.nullable().describe("设计资产详细内容"),
    validationErrors: DesignDocValidationErrorsSchema,
    message: z.string().describe("操作结果消息"),
  }),
});

export type CreateDesignDocFromMarkupParams = z.infer<
  typeof CreateDesignDocFromMarkupSchema
>["params"];
export type CreateDesignDocFromMarkupResult = z.infer<
  typeof CreateDesignDocFromMarkupSchema
>["result"];
export type ReplaceDesignSectionFromMarkupParams = z.infer<
  typeof ReplaceDesignSectionFromMarkupSchema
>["params"];
export type ReplaceDesignSectionFromMarkupResult = z.infer<
  typeof ReplaceDesignSectionFromMarkupSchema
>["result"];
export type ListDesignAssetsParams = z.infer<typeof ListDesignAssetsSchema>["params"];
export type ListDesignAssetsResult = z.infer<typeof ListDesignAssetsSchema>["result"];
export type ListDesignDocsParams = z.infer<typeof ListDesignDocsSchema>["params"];
export type ListDesignDocsResult = z.infer<typeof ListDesignDocsSchema>["result"];
export type ReadDesignAssetParams = z.infer<typeof ReadDesignAssetSchema>["params"];
export type ReadDesignAssetResult = z.infer<typeof ReadDesignAssetSchema>["result"];
export type ReadDesignDocParams = z.infer<typeof ReadDesignDocSchema>["params"];
export type ReadDesignDocResult = z.infer<typeof ReadDesignDocSchema>["result"];
