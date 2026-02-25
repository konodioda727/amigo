import { z } from "zod";

export const BrowserSearchSchema = z.object({
  name: z.literal("browserSearch"),
  params: z
    .object({
      query: z.string().min(1).describe("搜索关键词。工具会自动搜索并抓取所有搜索结果页面内容"),
    })
    .describe("浏览器搜索工具的参数"),
  result: z
    .object({
      content: z.string().describe("提取的网页内容或搜索结果"),
      url: z.string().optional().describe("访问的URL"),
      title: z.string().optional().describe("页面标题"),
      results: z
        .array(
          z.object({
            title: z.string().describe("搜索结果或页面标题"),
            url: z.string().describe("页面URL"),
            snippet: z.string().optional().describe("搜索摘要"),
            content: z.string().optional().describe("抓取到的页面正文内容"),
            error: z.string().optional().describe("抓取失败原因"),
          }),
        )
        .optional()
        .describe("搜索结果抓取明细"),
    })
    .describe("浏览器搜索的结果"),
});
