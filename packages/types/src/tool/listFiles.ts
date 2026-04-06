import { z } from "zod";

export const ListFilesSchema = z.object({
  name: z.literal("listFiles"),
  params: z
    .object({
      directoryPath: z
        .string()
        .optional()
        .describe("可选：要列出的目录路径；支持相对于沙箱工作目录的路径或绝对路径，默认当前目录"),
      maxDepth: z.number().optional().describe("可选：最大递归深度，1 表示仅列出直接子项"),
      includeHidden: z.boolean().optional().describe("可选：是否包含隐藏文件和隐藏目录"),
      maxEntries: z.number().optional().describe("可选：最多返回多少条结果"),
    })
    .describe("列出目录内容的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      directoryPath: z.string().describe("本次列出的目录路径"),
      tree: z.string().describe("以文件树文本展示的目录结构"),
      entries: z
        .array(
          z.object({
            path: z.string().describe("条目路径"),
            name: z.string().describe("条目名称"),
            type: z.enum(["file", "directory"]).describe("条目类型"),
            depth: z.number().describe("相对查询目录的层级深度"),
          }),
        )
        .describe("列出的目录条目"),
      truncated: z.boolean().describe("是否因 maxEntries 限制而截断"),
      maxDepth: z.number().describe("实际使用的最大递归深度"),
      includeHidden: z.boolean().describe("本次是否包含隐藏文件"),
      maxEntries: z.number().describe("本次使用的条目上限"),
      message: z.string().describe("操作结果消息"),
    })
    .describe("列出目录内容的结果"),
});

export type ListFilesParams = z.infer<typeof ListFilesSchema>["params"];
export type ListFilesResult = z.infer<typeof ListFilesSchema>["result"];
