import { z } from "zod";

const RuleDocumentSchema = z.object({
  success: z.boolean().describe("该规则是否读取成功"),
  id: z.string().describe("规则 ID"),
  title: z.string().optional().describe("规则标题"),
  type: z.string().optional().describe("规则类型"),
  summary: z.string().optional().describe("规则摘要"),
  whenToRead: z.string().optional().describe("建议何时阅读"),
  content: z.string().describe("规则正文"),
  message: z.string().describe("该规则的读取结果"),
});

export const ReadRulesSchema = z.object({
  name: z.literal("readRules"),
  params: z
    .object({
      ids: z.array(z.string().min(1)).min(1).describe("要读取的规则 ID 列表"),
    })
    .describe("读取宿主环境规则文档的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      ids: z.array(z.string()).describe("本次请求的规则 ID 列表"),
      documents: z.array(RuleDocumentSchema).describe("逐条规则读取结果"),
      message: z.string().describe("操作结果消息"),
    })
    .describe("读取规则文档的结果"),
});

export type ReadRulesParams = z.infer<typeof ReadRulesSchema>["params"];
export type ReadRulesResult = z.infer<typeof ReadRulesSchema>["result"];
