import { createTool } from "./base";
import { logger } from "@/utils/logger";
import { browserManager } from "@/utils/browserManager";

export const BrowserSearch = createTool({
  name: "browserSearch",
  description: "使用浏览器搜索信息或访问网页。可以执行搜索查询、访问特定URL或提取页面内容。",
  whenToUse:
    "当需要从互联网获取实时信息、查找资料、访问网页或提取网页内容时使用此工具。\n\n" +
    "## 使用场景\n\n" +
    "1. **搜索信息** - 使用 Bing 搜索引擎查找相关信息，获取搜索结果列表\n" +
    "2. **访问网页** - 访问特定的URL，自动提取：\n" +
    "   - 页面的主要文本内容\n" +
    "   - 页面中的重要链接（最多15个）\n" +
    "   - 可以根据这些链接继续深入探索\n\n" +
    "## ⚠️ 重要工作流程\n\n" +
    "**搜索后必须访问页面获取详细内容！**\n\n" +
    "正确的工作流程：\n" +
    "1. 使用 `action=search` 搜索相关信息，获取搜索结果列表\n" +
    "2. **从搜索结果中选择最相关的 2-3 个链接**\n" +
    "3. **使用 `action=navigate` 逐个访问这些链接，提取详细内容**\n" +
    "4. **页面会返回主要内容和相关链接列表**\n" +
    "5. **如果需要更深入的信息，可以继续访问页面中的相关链接**\n" +
    "6. 基于访问到的详细内容回答用户问题\n\n" +
    "❌ 错误做法：只搜索就直接总结，不访问具体页面\n" +
    "✅ 正确做法：搜索 → 访问最相关的页面 → 查看页面链接 → 深入探索 → 综合回答\n\n" +
    "## 注意事项\n\n" +
    "- 搜索结果只提供标题和摘要，**必须访问页面才能获取完整内容**\n" +
    "- 某些网站可能有访问限制或需要登录\n" +
    "- 提取的内容会自动清理HTML标签，保留纯文本\n" +
    "- 页面加载超时时间为30秒\n" +
    "- 可通过设置环境变量 BROWSER_HEADLESS=false 启用有头浏览器模式",

  useExamples: [
    `**示例 1 - 完整的搜索和访问流程**

用户请求：帮我查一下最新的 React 19 有什么新特性

步骤1：先搜索
<browserSearch>
  <query>React 19 新特性</query>
  <action>search</action>
</browserSearch>

步骤2：从搜索结果中选择最相关的链接，访问获取详细内容
<browserSearch>
  <url>https://react.dev/blog/2024/04/25/react-19</url>
  <action>navigate</action>
</browserSearch>

步骤3：页面返回了内容和相关链接，如果需要更多细节，继续访问相关链接
<browserSearch>
  <url>https://react.dev/reference/react/use</url>
  <action>navigate</action>
</browserSearch>

步骤4：基于访问到的详细内容，综合回答用户问题`,

    `**示例 2 - 直接访问已知网页**

用户请求：帮我看看 React 官网的文档

<browserSearch>
  <url>https://react.dev</url>
  <action>navigate</action>
</browserSearch>`,

    `**示例 3 - 新闻类查询的完整流程**

用户请求：今天有什么重要新闻

步骤1：搜索最新新闻
<browserSearch>
  <query>今天重要新闻</query>
  <action>search</action>
</browserSearch>

步骤2：访问搜索结果中的新闻网站获取详细内容
<browserSearch>
  <url>https://news.example.com/article/123</url>
  <action>navigate</action>
</browserSearch>

步骤3：访问更多新闻源
<browserSearch>
  <url>https://news.example2.com/article/456</url>
  <action>navigate</action>
</browserSearch>`,
  ],

  params: [
    {
      name: "query",
      optional: true,
      description: "搜索查询关键词（action为search时必填）",
    },
    {
      name: "url",
      optional: true,
      description: "要访问的网页URL（action为navigate时必填）",
    },
    {
      name: "action",
      optional: true,
      description:
        "操作类型：search（搜索）、navigate（访问URL并提取内容），默认为search",
    },
  ],

  async invoke({ params, signal }) {
    const { query, url, action = "search" } = params;
    let page = null;

    try {
      let content = "";
      let resultUrl = "";
      let title = "";

      page = await browserManager.getPage();

      // 处理中断信号
      if (signal?.aborted) {
        throw new Error("操作已取消");
      }

      switch (action) {
        case "search": {
          if (!query) {
            throw new Error("搜索操作需要提供 query 参数");
          }

          logger.info(`[BrowserSearch] 搜索: ${query}`);

          // 使用 Bing 搜索（对自动化更友好）
          const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN`;

          try {
            await page.goto(searchUrl, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });

            // 等待搜索结果加载
            await page.waitForSelector("#b_results, .b_algo", { timeout: 10000 }).catch(() => {
              logger.warn("[BrowserSearch] 搜索结果加载超时");
            });

            // 提取搜索结果
            const searchResults = await page.evaluate(() => {
              const results: Array<{ title: string; snippet: string; url: string }> = [];

              // @ts-ignore
              const resultElements = document.querySelectorAll(".b_algo");

              for (let i = 0; i < Math.min(resultElements.length, 8); i++) {
                const element = resultElements[i];
                const titleEl = element.querySelector("h2 a");
                const snippetEl = element.querySelector(".b_caption p, .b_algoSlug");

                if (titleEl) {
                  results.push({
                    title: titleEl.textContent?.trim() || "",
                    snippet: snippetEl?.textContent?.trim() || "",
                    //@ts-ignore
                    url: (titleEl as HTMLAnchorElement).href || "",
                  });
                }
              }

              return results.filter((item) => item.title && item.url);
            });

            // 格式化搜索结果
            content = `搜索 "${query}" 的结果：\n\n`;
            if (searchResults.length > 0) {
              searchResults.forEach(
                (result: { title: string; snippet: string; url: string }, index: number) => {
                  content += `${index + 1}. ${result.title}\n`;
                  if (result.snippet) {
                    content += `   ${result.snippet}\n`;
                  }
                  if (result.url) {
                    content += `   链接: ${result.url}\n`;
                  }
                  content += "\n";
                },
              );
            } else {
              content += "未找到相关结果。建议直接访问特定网页。";
            }

            resultUrl = searchUrl;
            title = `搜索结果 - ${query}`;
          } catch (error) {
            logger.error(`[BrowserSearch] 搜索失败: ${error}`);
            content = `搜索失败: ${error instanceof Error ? error.message : String(error)}\n\n建议：可以尝试直接访问特定网页获取信息。`;
            resultUrl = searchUrl;
            title = `搜索失败 - ${query}`;
          }
          break;
        }

        case "navigate": {
          if (!url) {
            throw new Error("导航操作需要提供 url 参数");
          }

          logger.info(`[BrowserSearch] 访问URL: ${url}`);

          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

          // 提取页面标题、内容和可交互元素
          const pageData = await page.evaluate(() => {
            // @ts-ignore
            const scripts = document.querySelectorAll("script, style, noscript");
            // @ts-ignore
            scripts.forEach((el) => {
              el.remove();
            });

            // @ts-ignore
            const pageTitle = document.title;

            // @ts-ignore
            const mainContent =
              // @ts-ignore
              document.querySelector("main")?.textContent ||
              // @ts-ignore
              document.querySelector("article")?.textContent ||
              // @ts-ignore
              document.body.textContent ||
              "";

            // 提取页面中的重要链接
            const links: Array<{ text: string; url: string; type: string }> = [];
            
            // @ts-ignore
            const linkElements = document.querySelectorAll("a[href], button[onclick], [role='button']");
            
            for (let i = 0; i < Math.min(linkElements.length, 20); i++) {
              const el = linkElements[i];
              const text = el.textContent?.trim() || "";
              
              // 过滤掉空文本和太短的链接
              if (text && text.length > 2 && text.length < 100) {
                let linkUrl = "";
                let linkType = "link";
                
                if (el.tagName === "A") {
                  // @ts-ignore
                  linkUrl = el.href || "";
                  linkType = "link";
                } else if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
                  linkType = "button";
                  // @ts-ignore
                  linkUrl = el.getAttribute("data-url") || el.getAttribute("onclick") || "";
                }
                
                // 只保留有效的链接
                if (linkType === "link" && linkUrl && !linkUrl.startsWith("javascript:")) {
                  links.push({ text, url: linkUrl, type: linkType });
                }
              }
            }

            return {
              title: pageTitle,
              content: mainContent.replace(/\s+/g, " ").trim().substring(0, 5000),
              links: links.slice(0, 15), // 最多返回15个链接
            };
          });

          // 格式化内容，包含链接信息
          content = pageData.content;
          
          if (pageData.links && pageData.links.length > 0) {
            content += "\n\n---\n## 页面中的相关链接：\n\n";
            pageData.links.forEach((link: { text: string; url: string; type: string }, index: number) => {
              content += `${index + 1}. [${link.text}](${link.url})\n`;
            });
            content += "\n💡 提示：如果需要更深入的信息，可以继续访问上述相关链接。";
          }

          title = pageData.title;
          resultUrl = url;
          break;
        }

        default:
          throw new Error(`不支持的操作类型: ${action}。支持的操作：search（搜索）、navigate（访问网页）`);
      }

      return {
        message: `浏览器操作成功完成。${action === "search" ? `\n搜索关键词: ${query} \n ## 搜索结论：${content}` : action === "navigate" ? `访问URL: ${url}，页面内容为： ${content}` : `已提取页面内容，如下：${content}`}`,
        toolResult: {
          content,
          url: resultUrl || undefined,
          title: title || undefined,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[BrowserSearch] 执行失败: ${errorMessage}`);

      return {
        message: `浏览器操作失败: ${errorMessage}`,
        toolResult: {
          content: `错误: ${errorMessage}`,
        },
      };
    } finally {
      // 关闭页面
      if (page) {
        try {
          await page.close();
        } catch (error) {
          logger.error("[BrowserSearch] 关闭页面失败:", error);
        }
      }
    }
  },
});
