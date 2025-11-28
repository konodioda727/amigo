import { z } from "zod";

export const BrowserSearchSchema = z.object({
  name: z.literal("browserSearch"),
  params: z
    .object({
      query: z.string().describe("搜索查询关键词"),
      url: z.string().optional().describe("可选：直接访问的网页URL（如果提供则跳过搜索）"),
      action: z
        .enum(["search", "navigate", "extract"])
        .default("search")
        .describe("操作类型：search=搜索，navigate=访问URL，extract=提取当前页面内容"),
    })
    .describe("浏览器搜索工具的参数"),
  result: z
    .object({
      content: z.string().describe("提取的网页内容或搜索结果"),
      url: z.string().optional().describe("访问的URL"),
      title: z.string().optional().describe("页面标题"),
    })
    .describe("浏览器搜索的结果"),
});
