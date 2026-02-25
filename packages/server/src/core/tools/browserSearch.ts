import type { Page } from "playwright";
import { browserManager } from "@/utils/browserManager";
import { logger } from "@/utils/logger";
import { createTool } from "./base";

type SearchResult = {
  title: string;
  snippet: string;
  url: string;
};

type FetchedSearchResult = {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
  error?: string;
};

const SEARCH_PAGE_TIMEOUT_MS = 12000;
const FETCH_PAGE_TIMEOUT_MS = 10000;
const SEARCH_RESULT_WAIT_MS = 5000;
const MAX_PAGE_CONTENT_LENGTH = 5000;
const FETCH_CONCURRENCY = 4;
const PAGE_SETTLE_WAIT_MS = 1500;
const PAGE_EVALUATE_RETRY_COUNT = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isExecutionContextDestroyedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Execution context was destroyed");
};

export const BrowserSearch = createTool({
  name: "browserSearch",
  description: "使用浏览器搜索信息，并自动抓取搜索结果页面的正文内容。",
  whenToUse:
    "当需要从互联网获取实时信息并查看搜索结果对应网页的实际内容时使用此工具。\n\n" +
    "## 工具行为\n\n" +
    "1. 使用 Bing 执行搜索\n" +
    "2. 提取当前搜索结果页中的结果链接\n" +
    "3. 自动逐个访问这些链接\n" +
    "4. 返回每个网站的标题、链接、摘要和抓取到的正文内容（或失败原因）\n\n" +
    "## 注意事项\n\n" +
    "- 该工具只有搜索功能，不再支持单独传入 URL 导航\n" +
    "- 会尝试抓取搜索结果页中识别到的全部标准结果\n" +
    "- 某些网站可能有访问限制、反爬或需要登录，工具会返回失败原因\n" +
    "- 单个页面正文会截断（默认最多5000字符）以控制返回体积\n" +
    "- 页面加载超时时间为30秒\n" +
    "- 可通过设置环境变量 BROWSER_HEADLESS=false 启用有头浏览器模式",

  useExamples: [
    `**示例 1 - 搜索并自动抓取所有结果页内容**

用户请求：帮我查一下 React 19 新特性

<browserSearch>
  <query>React 19 新特性</query>
</browserSearch>`,

    `**示例 2 - 新闻查询**

用户请求：今天 AI 领域有哪些重要新闻

<browserSearch>
  <query>今天 AI 重要新闻</query>
</browserSearch>`,
  ],

  params: [
    {
      name: "query",
      optional: false,
      description: "搜索关键词。工具会自动搜索并抓取搜索结果页面内容。",
    },
  ],

  async invoke({ params, context }) {
    const { query } = params;
    const { signal } = context;
    const activePages = new Set<Page>();

    const createAbortError = () => {
      const abortError = new Error("操作已取消");
      abortError.name = "AbortError";
      return abortError;
    };

    const assertNotAborted = () => {
      if (signal?.aborted) {
        throw createAbortError();
      }
    };

    const withAbort = async <T>(promise: Promise<T>): Promise<T> => {
      if (!signal) {
        return promise;
      }
      assertNotAborted();

      return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(createAbortError());
        signal.addEventListener("abort", onAbort, { once: true });

        promise
          .then(resolve)
          .catch(reject)
          .finally(() => signal.removeEventListener("abort", onAbort));
      });
    };

    const trackPage = (page: Page) => {
      activePages.add(page);
      return page;
    };

    const createTrackedPage = async () => trackPage(await withAbort(browserManager.getPage()));

    const optimizePageForScrape = async (page: Page) => {
      try {
        await page.route("**/*", (route) => {
          const resourceType = route.request().resourceType();
          if (resourceType === "image" || resourceType === "media" || resourceType === "font") {
            return route.abort();
          }
          return route.continue();
        });
      } catch (error) {
        logger.debug("[BrowserSearch] 注册资源拦截失败（可忽略）:", error);
      }
    };

    const closeTrackedPage = async (page: Page | null | undefined) => {
      if (!page) {
        return;
      }
      activePages.delete(page);
      try {
        await page.close();
      } catch (error) {
        logger.debug("[BrowserSearch] 关闭页面失败（可忽略）:", error);
      }
    };

    const waitForPageToSettle = async (page: Page) => {
      await withAbort(page.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {}));
      await withAbort(
        page.waitForLoadState("load", { timeout: PAGE_SETTLE_WAIT_MS }).catch(() => {}),
      );
      await withAbort(
        page.waitForLoadState("networkidle", { timeout: PAGE_SETTLE_WAIT_MS }).catch(() => {}),
      );
      await withAbort(page.waitForTimeout(200));
    };

    const extractPageData = async (page: Page) =>
      withAbort(
        page.evaluate((maxLength) => {
          // @ts-expect-error
          const removableNodes = document.querySelectorAll("script, style, noscript");
          // @ts-expect-error
          removableNodes.forEach((node) => {
            node.remove();
          });

          // @ts-expect-error
          const pageTitle = document.title?.trim() || "";

          const contentCandidates = [
            // @ts-expect-error
            document.querySelector("main")?.textContent,
            // @ts-expect-error
            document.querySelector("article")?.textContent,
            // @ts-expect-error
            document.querySelector("[role='main']")?.textContent,
            // @ts-expect-error
            document.body?.innerText,
            // @ts-expect-error
            document.body?.textContent,
          ];

          const rawContent = contentCandidates.find(
            (value) => typeof value === "string" && value.trim().length > 0,
          );

          const content = String(rawContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, maxLength);

          return {
            title: pageTitle,
            content,
          };
        }, MAX_PAGE_CONTENT_LENGTH),
      );

    const onAbortClosePages = () => {
      for (const page of activePages) {
        void page.close().catch((error: unknown) => {
          logger.debug("[BrowserSearch] 中断时关闭页面失败（可忽略）:", error);
        });
      }
      activePages.clear();
    };
    signal?.addEventListener("abort", onAbortClosePages, { once: true });

    try {
      if (!query?.trim()) {
        throw new Error("搜索操作需要提供 query 参数");
      }

      const keyword = query.trim();
      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(keyword)}&setlang=zh-CN`;
      logger.info(`[BrowserSearch] 搜索并抓取: ${keyword}`);

      let searchPage: Page | null = null;
      let searchResults: SearchResult[] = [];

      try {
        searchPage = await createTrackedPage();

        await withAbort(
          searchPage.goto(searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: SEARCH_PAGE_TIMEOUT_MS,
          }),
        );

        await withAbort(
          searchPage
            .waitForSelector("#b_results, .b_algo", { timeout: SEARCH_RESULT_WAIT_MS })
            .catch(() => {
              logger.warn("[BrowserSearch] 搜索结果加载超时");
            }),
        );

        searchResults = await withAbort(
          searchPage.evaluate(() => {
            const results: Array<{ title: string; snippet: string; url: string }> = [];
            const seenUrls = new Set<string>();

            // @ts-expect-error
            const resultElements = document.querySelectorAll(".b_algo");

            for (const element of resultElements) {
              const titleEl = element.querySelector("h2 a");
              const snippetEl = element.querySelector(".b_caption p, .b_algoSlug");

              if (!titleEl) {
                continue;
              }

              // @ts-expect-error
              const href = (titleEl as HTMLAnchorElement).href || "";
              const title = titleEl.textContent?.trim() || "";
              const snippet = snippetEl?.textContent?.trim() || "";

              if (!title || !href || seenUrls.has(href)) {
                continue;
              }

              if (href.startsWith("javascript:")) {
                continue;
              }

              seenUrls.add(href);
              results.push({ title, snippet, url: href });
            }

            return results;
          }),
        );
      } finally {
        await closeTrackedPage(searchPage);
      }

      if (searchResults.length === 0) {
        const emptyContent = `搜索 "${keyword}" 未找到可抓取的结果。`;
        return {
          message: `浏览器搜索完成，但没有可抓取的搜索结果。关键词: ${keyword}`,
          toolResult: {
            content: emptyContent,
            url: searchUrl,
            title: `搜索结果 - ${keyword}`,
            results: [],
          },
        };
      }

      const fetchSingleResult = async (result: SearchResult): Promise<FetchedSearchResult> => {
        assertNotAborted();
        let page: Page | null = null;
        try {
          logger.info(`[BrowserSearch] 抓取结果页: ${result.url}`);
          page = await createTrackedPage();
          await optimizePageForScrape(page);

          await withAbort(
            page.goto(result.url, {
              waitUntil: "domcontentloaded",
              timeout: FETCH_PAGE_TIMEOUT_MS,
            }),
          );
          await waitForPageToSettle(page);

          let pageData: { title: string; content: string } | null = null;
          let lastEvaluateError: unknown = null;
          for (let attempt = 0; attempt <= PAGE_EVALUATE_RETRY_COUNT; attempt++) {
            try {
              pageData = await extractPageData(page);
              break;
            } catch (error) {
              lastEvaluateError = error;
              if (
                !isExecutionContextDestroyedError(error) ||
                attempt === PAGE_EVALUATE_RETRY_COUNT
              ) {
                throw error;
              }
              logger.debug(
                `[BrowserSearch] 页面抓取遇到导航抖动，重试 evaluate（${attempt + 1}/${PAGE_EVALUATE_RETRY_COUNT + 1}）: ${result.url}`,
              );
              await waitForPageToSettle(page);
              await sleep(150);
            }
          }

          if (!pageData) {
            throw lastEvaluateError instanceof Error
              ? lastEvaluateError
              : new Error("页面内容提取失败");
          }

          const finalUrl = page.url() || result.url;
          return {
            title: pageData.title || result.title,
            url: finalUrl,
            snippet: result.snippet || undefined,
            content: pageData.content || "",
          };
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            throw error;
          }

          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`[BrowserSearch] 抓取失败: ${result.url} - ${errorMessage}`);
          return {
            title: result.title,
            url: page?.url() || result.url,
            snippet: result.snippet || undefined,
            error: errorMessage,
          };
        } finally {
          await closeTrackedPage(page);
        }
      };

      const fetchedResults = new Array<FetchedSearchResult>(searchResults.length);
      let nextIndex = 0;
      const workerCount = Math.min(FETCH_CONCURRENCY, searchResults.length);

      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (true) {
            assertNotAborted();
            const currentIndex = nextIndex;
            nextIndex += 1;
            if (currentIndex >= searchResults.length) {
              return;
            }
            const result = searchResults[currentIndex];
            if (!result) {
              return;
            }
            fetchedResults[currentIndex] = await fetchSingleResult(result);
          }
        }),
      );

      const successCount = fetchedResults.filter((item) => item && !item.error).length;
      const failureCount = fetchedResults.filter((item) => item?.error).length;
      let content = `搜索 "${keyword}" 并抓取网页内容完成。\n`;
      content += `共识别 ${searchResults.length} 个搜索结果，成功抓取 ${successCount} 个，失败 ${failureCount} 个。\n`;
      content +=
        "详细网页内容已写入 result.results（每条包含 title/url/snippet/content 或 error）。";

      return {
        message: `浏览器搜索并抓取完成。关键词: ${keyword}，共处理 ${searchResults.length} 个搜索结果。`,
        toolResult: {
          content,
          url: searchUrl,
          title: `搜索并抓取 - ${keyword}`,
          results: fetchedResults.filter(Boolean),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[BrowserSearch] 执行失败: ${errorMessage}`);

      return {
        message: `浏览器搜索失败: ${errorMessage}`,
        toolResult: {
          content: `错误: ${errorMessage}`,
        },
      };
    } finally {
      signal?.removeEventListener("abort", onAbortClosePages);
      for (const page of [...activePages]) {
        await closeTrackedPage(page);
      }
    }
  },
});
