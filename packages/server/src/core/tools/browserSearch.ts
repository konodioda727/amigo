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
const SEARCH_RSS_TIMEOUT_MS = 8000;
const MAX_PAGE_CONTENT_LENGTH = 5000;
const FETCH_CONCURRENCY = 4;
const PAGE_SETTLE_WAIT_MS = 1500;
const PAGE_EVALUATE_RETRY_COUNT = 2;
const SEARCH_RESULT_LIMIT = 10;

const GOV_QUERY_HINT_PATTERN =
  /公务员|分数线|录取|最低|招录|招考|考试|公告|成绩|岗位|编制|国考|省考|事业单位|政府|政务|人社/;
const FOREIGN_NOISE_PATTERN =
  /\b(?:usd|eur|currency|convert(?:er)?|dollar|euro|taux|boursorama|xe|wise)\b/i;
const EXTRA_KEYWORD_HINTS = [
  "杭州",
  "杭州市",
  "公务员",
  "考试",
  "分数线",
  "录取",
  "最低",
  "招录",
  "国考",
  "省考",
] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isExecutionContextDestroyedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Execution context was destroyed");
};

const decodeXmlEntities = (input: string) =>
  input
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const stripTagsAndTrim = (input: string) =>
  decodeXmlEntities(input)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractTag = (xml: string, tagName: string) => {
  const matched = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  if (!matched?.[1]) {
    return "";
  }
  return stripTagsAndTrim(matched[1]);
};

const normalizeResultUrl = (raw: string) => {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
};

const parseBingRss = (xml: string): SearchResult[] => {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const item of items) {
    const title = extractTag(item, "title");
    const url = normalizeResultUrl(extractTag(item, "link"));
    const snippet = extractTag(item, "description");
    if (!title || !url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    results.push({ title, url, snippet });
  }

  return results;
};

const extractQueryKeywords = (query: string) => {
  const normalized = query.toLowerCase();
  const zhChunks = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const latinChunks = normalized.match(/[a-z]{2,}/g) || [];
  const numericChunks = normalized.match(/\b\d{4}\b/g) || [];
  const hinted = EXTRA_KEYWORD_HINTS.filter((hint) => normalized.includes(hint));

  return [...new Set([...zhChunks, ...latinChunks, ...numericChunks, ...hinted])].slice(0, 20);
};

const computeRelevanceScore = (result: SearchResult, queryKeywords: string[]) => {
  if (queryKeywords.length === 0) {
    return 1;
  }
  const combined = `${result.title} ${result.snippet}`.toLowerCase();
  let score = 0;
  for (const keyword of queryKeywords) {
    if (combined.includes(keyword)) {
      score += 1;
    }
  }
  return score;
};

const keepRelevantResults = (results: SearchResult[], query: string) => {
  if (results.length === 0) {
    return results;
  }

  const keywords = extractQueryKeywords(query);
  if (keywords.length === 0) {
    return results;
  }

  const scored = results.map((result) => ({
    result,
    score: computeRelevanceScore(result, keywords),
  }));
  const relevant = scored.filter((item) => item.score > 0).map((item) => item.result);

  if (relevant.length >= Math.min(3, Math.ceil(results.length / 3))) {
    return relevant;
  }

  return results;
};

const shouldFallbackToGovSearch = (query: string, results: SearchResult[]) => {
  if (!GOV_QUERY_HINT_PATTERN.test(query)) {
    return false;
  }
  if (results.length === 0) {
    return true;
  }

  const top = results.slice(0, 5);
  const keywords = extractQueryKeywords(query);
  const relevantTopCount = top.filter((item) => computeRelevanceScore(item, keywords) > 0).length;
  const noisyTopCount = top.filter((item) =>
    FOREIGN_NOISE_PATTERN.test(`${item.title} ${item.snippet}`),
  ).length;

  return relevantTopCount <= 1 || noisyTopCount >= Math.ceil(top.length / 2);
};

export const BrowserSearch = createTool({
  name: "browserSearch",
  description: "使用浏览器搜索信息，并自动抓取搜索结果页面的正文内容。",
  whenToUse:
    "需要获取互联网实时信息并抓取搜索结果页正文时使用。仅支持 query 搜索，不用于直接访问单个 URL。",

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
      const buildSearchUrl = (searchKeyword: string, extraParams?: Record<string, string>) => {
        const searchParams = new URLSearchParams({
          q: searchKeyword,
          setlang: "zh-CN",
          mkt: "zh-CN",
          cc: "CN",
          ensearch: "0",
          ...(extraParams || {}),
        });
        return `https://cn.bing.com/search?${searchParams.toString()}`;
      };

      const searchViaRss = async (searchKeyword: string): Promise<SearchResult[]> => {
        const rssUrl = buildSearchUrl(searchKeyword, { format: "rss" });
        try {
          const response = (await withAbort(
            Promise.race([
              fetch(rssUrl, {
                headers: {
                  accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
                  "user-agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                },
                signal,
              }),
              sleep(SEARCH_RSS_TIMEOUT_MS).then(() => {
                throw new Error("RSS 搜索超时");
              }),
            ]),
          )) as Response;

          if (!response.ok) {
            throw new Error(`RSS 搜索失败: HTTP ${response.status}`);
          }

          const xml = await withAbort(response.text());
          const parsed = parseBingRss(xml).slice(0, SEARCH_RESULT_LIMIT);
          logger.info(`[BrowserSearch] RSS 搜索命中 ${parsed.length} 条: ${searchKeyword}`);
          return parsed;
        } catch (error) {
          logger.warn(
            `[BrowserSearch] RSS 搜索失败，回退到页面抓取: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return [];
        }
      };

      const searchViaSerp = async (searchUrl: string): Promise<SearchResult[]> => {
        let searchPage: Page | null = null;
        try {
          searchPage = await createTrackedPage();
          await withAbort(searchPage.context().clearCookies());

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

          return await withAbort(
            searchPage.evaluate(() => {
              const results: Array<{ title: string; snippet: string; url: string }> = [];
              const seenUrls = new Set<string>();

              const normalizeUrl = (rawHref: string) => {
                try {
                  const parsed = new URL(rawHref, window.location.href);
                  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                    return "";
                  }
                  return parsed.toString();
                } catch {
                  return "";
                }
              };

              // Bing 页面中很多模块也会出现 b_algo，优先只取主结果区的直接子项。
              const primaryResultElements = Array.from(
                document.querySelectorAll("#b_results > li.b_algo, #b_results > .b_algo"),
              );
              const fallbackResultElements = Array.from(
                document.querySelectorAll("#b_results .b_algo"),
              );
              const resultElements =
                primaryResultElements.length > 0 ? primaryResultElements : fallbackResultElements;

              for (const element of resultElements) {
                if (element.closest(".b_ad, .b_ans, .b_pole, #b_context, #b_topw, #b_bottomw")) {
                  continue;
                }

                const titleEl = element.querySelector("h2 a[href], h3 a[href]");
                const snippetEl = element.querySelector(".b_caption p, .b_algoSlug");

                if (!titleEl) {
                  continue;
                }

                // @ts-expect-error
                const rawHref =
                  titleEl.getAttribute("href") || (titleEl as HTMLAnchorElement).href || "";
                const href = normalizeUrl(rawHref);
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
      };

      let searchUrl = buildSearchUrl(keyword);
      logger.info(`[BrowserSearch] 搜索并抓取: ${keyword}`);

      let searchResults: SearchResult[] = await searchViaRss(keyword);
      if (searchResults.length === 0) {
        searchResults = await searchViaSerp(searchUrl);
      }

      searchResults = keepRelevantResults(searchResults, keyword);

      if (shouldFallbackToGovSearch(keyword, searchResults) && !keyword.includes("site:gov.cn")) {
        const govKeyword = `${keyword} site:gov.cn`;
        const govSearchUrl = buildSearchUrl(govKeyword);
        logger.warn(`[BrowserSearch] 结果相关性较低，触发政务站点回退搜索: ${govKeyword}`);

        let govResults = await searchViaRss(govKeyword);
        if (govResults.length === 0) {
          govResults = await searchViaSerp(govSearchUrl);
        }
        govResults = keepRelevantResults(govResults, keyword);

        if (govResults.length > 0) {
          searchResults = govResults;
          searchUrl = govSearchUrl;
        }
      }

      searchResults = searchResults.slice(0, SEARCH_RESULT_LIMIT);

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

      const content = `抓取网页内容完成。\n`;

      return {
        message: `网页搜索并抓取完成。`,
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
