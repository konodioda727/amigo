import { z } from "zod";

const DesignDocAvailableDocSchema = z.object({
  pageId: z.string().describe("设计稿页面标识"),
  title: z.string().nullable().optional().describe("设计稿标题"),
  updatedAt: z.string().nullable().optional().describe("最近更新时间"),
  schemaVersion: z.number().optional().describe("设计稿 schema 版本"),
  valid: z.boolean().optional().describe("设计稿是否通过 schema 校验"),
});

const EditDesignDocSummarySchema = z.object({
  pageName: z.string().optional().describe("页面名称"),
  width: z.number().optional().describe("页面宽度"),
  minHeight: z.number().optional().describe("页面最小高度"),
  sectionCount: z.number().optional().describe("区块数量"),
});

const ReadDesignDocSummarySchema = z.object({
  title: z.string().nullable().optional().describe("设计稿标题"),
  pageName: z.string().optional().describe("页面名称"),
  width: z.number().optional().describe("页面宽度"),
  minHeight: z.number().optional().describe("页面最小高度"),
  sectionCount: z.number().optional().describe("区块数量"),
  updatedAt: z.string().optional().describe("最近更新时间"),
});

const DesignDocValidationErrorsSchema = z.array(z.string()).describe("设计稿 schema 校验错误列表");

/**
 * EditDesignDoc 工具 Schema
 * 用于创建或更新任务关联的页面设计稿
 */
export const EditDesignDocSchema = z.object({
  name: z.literal("editDesignDoc"),
  params: z
    .object({
      pageId: z.string().describe("页面或视图标识，推荐 kebab-case"),
      title: z.string().optional().describe("设计稿标题"),
      content: z.string().describe("完整设计稿 JSON，或按行替换时的 JSON 片段"),
      mergeWithExisting: z
        .union([z.boolean(), z.literal("true"), z.literal("false")])
        .optional()
        .describe("是否与现有设计稿做对象级合并"),
      startLine: z
        .union([z.number(), z.string()])
        .optional()
        .describe("按行修改模式下的起始行号（从 1 开始）"),
      endLine: z
        .union([z.number(), z.string()])
        .optional()
        .describe("按行修改模式下的结束行号（包含）"),
    })
    .describe("编辑设计稿的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      pageId: z.string().describe("设计稿页面标识"),
      startLine: z.number().optional().describe("实际生效的起始行号"),
      endLine: z.number().optional().describe("实际生效的结束行号"),
      title: z.string().nullable().optional().describe("设计稿标题"),
      updatedAt: z.string().optional().describe("最近更新时间"),
      summary: EditDesignDocSummarySchema.optional().describe("设计稿摘要"),
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
    })
    .describe("编辑设计稿的结果"),
});

/**
 * ReadDesignDoc 工具 Schema
 * 用于读取任务关联的页面设计稿或设计稿索引
 */
export const ReadDesignDocSchema = z.object({
  name: z.literal("readDesignDoc"),
  params: z
    .object({
      pageId: z.string().optional().describe("要读取的页面标识；为空时返回设计稿索引"),
    })
    .describe("读取设计稿的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      pageId: z.string().describe("设计稿页面标识；读取索引时为空字符串"),
      content: z.string().describe("带行号的设计稿内容；读取索引时为空字符串"),
      summary: ReadDesignDocSummarySchema.optional().describe("设计稿摘要"),
      availableDocs: z.array(DesignDocAvailableDocSchema).describe("当前任务下可用的设计稿索引"),
      validationErrors: DesignDocValidationErrorsSchema,
      message: z.string().describe("操作结果消息"),
    })
    .describe("读取设计稿的结果"),
});

export type EditDesignDocParams = z.infer<typeof EditDesignDocSchema>["params"];
export type EditDesignDocResult = z.infer<typeof EditDesignDocSchema>["result"];
export type ReadDesignDocParams = z.infer<typeof ReadDesignDocSchema>["params"];
export type ReadDesignDocResult = z.infer<typeof ReadDesignDocSchema>["result"];
