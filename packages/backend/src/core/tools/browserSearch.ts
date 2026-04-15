import { logger } from "@/utils/logger";
import { createTool } from "./base";
import { createToolResult } from "./result";

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

const SEARCH_ENGINE = "google" as const;
const SEARCH_API_TIMEOUT_MS = 8000;
const SEARCH_HTTP_TIMEOUT_MS = 10000;
const FETCH_HTTP_TIMEOUT_MS = 9000;
const MAX_PAGE_CONTENT_LENGTH = 5000;
const MIN_HTTP_CONTENT_LENGTH = 120;
const FETCH_CONCURRENCY = 4;
const SEARCH_RESULT_LIMIT = 10;
const CONTINUATION_RESULT_LIMIT = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const decodeHtmlEntities = (input: string) =>
  input
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const stripTagsAndTrim = (input: string) =>
  decodeHtmlEntities(input)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeUrl = (raw: string) => {
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

const buildGoogleSearchUrl = (keyword: string) => {
  const searchParams = new URLSearchParams({
    q: keyword,
    hl: "zh-CN",
    gl: "us",
    num: String(SEARCH_RESULT_LIMIT),
    pws: "0",
    safe: "off",
  });
  return `https://www.google.com/search?${searchParams.toString()}`;
};

const extractQueryKeywords = (query: string) => {
  const normalized = query.toLowerCase();
  const zhChunks = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const latinChunks = normalized.match(/[a-z]{2,}/g) || [];
  const numericChunks = normalized.match(/\b\d{2,}\b/g) || [];
  return [...new Set([...zhChunks, ...latinChunks, ...numericChunks])].slice(0, 20);
};

const rankResultsByQuery = (results: SearchResult[], query: string) => {
  const keywords = extractQueryKeywords(query);
  if (keywords.length === 0) {
    return results;
  }

  return results
    .map((result, index) => {
      const haystack = `${result.title} ${result.snippet}`.toLowerCase();
      const score = keywords.reduce((total, keyword) => {
        return total + (haystack.includes(keyword) ? 1 : 0);
      }, 0);
      return { result, score, index };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    })
    .map((item) => item.result);
};

const dedupeResults = (results: SearchResult[]) => {
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const result of results) {
    const normalized = normalizeUrl(result.url);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push({ ...result, url: normalized });
  }
  return deduped;
};

const readOptionalEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : "";
};

const extractTextFromHtml = (html: string) => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = stripTagsAndTrim(titleMatch?.[1] || "");

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const contentSource = bodyMatch?.[1] || html;

  const cleaned = contentSource
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ");

  const content = stripTagsAndTrim(cleaned).slice(0, MAX_PAGE_CONTENT_LENGTH);
  return { title, content };
};

const extractSerperResults = (payload: unknown): SearchResult[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.organic)) {
    return [];
  }

  return record.organic
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const snippet = typeof row.snippet === "string" ? row.snippet.trim() : "";
      const url = typeof row.link === "string" ? row.link.trim() : "";

      if (!title || !url) {
        return null;
      }

      return { title, snippet, url };
    })
    .filter((item): item is SearchResult => Boolean(item));
};

const extractGoogleResultUrl = (rawHref: string) => {
  try {
    const href = decodeHtmlEntities(rawHref.trim());
    if (!href) {
      return "";
    }

    if (href.startsWith("http://") || href.startsWith("https://")) {
      const parsed = new URL(href);
      if (/(^|\.)google\./i.test(parsed.hostname) && parsed.pathname.startsWith("/search")) {
        return "";
      }
      return parsed.toString();
    }

    const parsed = new URL(href, "https://www.google.com");
    if (parsed.pathname !== "/url") {
      return "";
    }

    const target = parsed.searchParams.get("q") || parsed.searchParams.get("url") || "";
    return normalizeUrl(target);
  } catch {
    return "";
  }
};

const parseGoogleSearchHtml = (html: string): SearchResult[] => {
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  const anchorPattern = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null = anchorPattern.exec(html);
  while (match) {
    const href = match[1] || "";
    const anchorInnerHtml = match[2] || "";

    const titleMatch = anchorInnerHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = stripTagsAndTrim(titleMatch?.[1] || "");
    const url = extractGoogleResultUrl(href);

    if (!title || !url || seen.has(url)) {
      match = anchorPattern.exec(html);
      continue;
    }

    const afterAnchor = html.slice(anchorPattern.lastIndex, anchorPattern.lastIndex + 1200);
    const snippetMatch = afterAnchor.match(
      /<(?:div|span)[^>]*class="[^"]*(?:VwiC3b|s3v9rd|MUxGbd|aCOpRe|yXK7lf)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i,
    );
    const snippet = stripTagsAndTrim(snippetMatch?.[1] || "");

    seen.add(url);
    results.push({ title, snippet, url });

    if (results.length >= SEARCH_RESULT_LIMIT) {
      break;
    }

    match = anchorPattern.exec(html);
  }

  return results;
};

const buildBrowserSearchContinuationSummary = (query: string): string => `【已搜索 ${query}】`;

const buildBrowserSearchContinuationResult = (
  keyword: string,
  searchUrl: string,
  results: FetchedSearchResult[],
) => {
  const limitedResults = results.slice(0, CONTINUATION_RESULT_LIMIT).map((result) => ({
    title: result.title,
    url: result.url,
    ...(result.snippet ? { snippet: result.snippet } : {}),
    ...(result.error ? { error: result.error } : {}),
  }));
  const successCount = results.filter((result) => !result.error).length;
  const failureCount = results.length - successCount;

  return {
    content: `搜索 "${keyword}" 完成，共 ${results.length} 条结果（成功 ${successCount}，失败 ${failureCount}）。`,
    url: searchUrl,
    title: `Google 搜索并抓取 - ${keyword}`,
    results: limitedResults,
  };
};

export const BrowserSearch = createTool({
  name: "browserSearch",
  description: "使用 Google 搜索信息，并自动抓取搜索结果页面正文（纯 HTTP，无浏览器回退）。",
  whenToUse:
    "需要获取互联网实时信息并抓取搜索结果页正文时使用。仅支持 query 搜索，不用于直接访问单个 URL。",
  executionMode: "parallel_readonly",
  historyProfile: {
    progressKind: "search",
    getResourceKeys: ({ params }) =>
      typeof params.query === "string" && params.query.trim()
        ? [`search:${params.query.trim()}`]
        : [],
  },

  params: [
    {
      name: "query",
      optional: false,
      description:
        "搜索关键词。工具会优先走 Google API（若配置），否则走 Google HTML 解析，再抓取结果页面正文。",
    },
  ],

  async invoke({ params, context }) {
    const { query } = params;
    const { signal } = context;

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

    const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) =>
      Promise.race([
        promise,
        sleep(timeoutMs).then(() => {
          throw new Error(timeoutMessage);
        }),
      ]);

    const searchViaSerper = async (keyword: string): Promise<SearchResult[]> => {
      const apiKey = readOptionalEnv("SERPER_API_KEY");
      if (!apiKey) {
        return [];
      }

      try {
        const response = (await withAbort(
          withTimeout(
            fetch("https://google.serper.dev/search", {
              method: "POST",
              headers: {
                "x-api-key": apiKey,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                q: keyword,
                num: SEARCH_RESULT_LIMIT,
                hl: "zh-cn",
                gl: "us",
              }),
              signal,
            }),
            SEARCH_API_TIMEOUT_MS,
            "SERPER 搜索超时",
          ),
        )) as Response;

        if (!response.ok) {
          throw new Error(`SERPER 搜索失败: HTTP ${response.status}`);
        }

        const json = await withAbort(response.json());
        const parsed = dedupeResults(extractSerperResults(json)).slice(0, SEARCH_RESULT_LIMIT);
        logger.info(`[BrowserSearch] SERPER 搜索命中 ${parsed.length} 条: ${keyword}`);
        return parsed;
      } catch (error) {
        logger.warn(
          `[BrowserSearch] SERPER 搜索失败，回退 Google HTML 解析: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return [];
      }
    };

    const searchViaGoogleHtml = async (searchUrl: string): Promise<SearchResult[]> => {
      try {
        const response = (await withAbort(
          withTimeout(
            fetch(searchUrl, {
              headers: {
                accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
                "user-agent":
                  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
              },
              signal,
            }),
            SEARCH_HTTP_TIMEOUT_MS,
            "Google 搜索页请求超时",
          ),
        )) as Response;

        if (!response.ok) {
          throw new Error(`Google 搜索页请求失败: HTTP ${response.status}`);
        }

        const html = await withAbort(response.text());
        const parsed = dedupeResults(parseGoogleSearchHtml(html)).slice(0, SEARCH_RESULT_LIMIT);
        logger.info(`[BrowserSearch] Google HTML 解析命中 ${parsed.length} 条`);
        return parsed;
      } catch (error) {
        logger.warn(
          `[BrowserSearch] Google HTML 解析失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return [];
      }
    };

    const fetchViaHttp = async (
      result: SearchResult,
    ): Promise<{ title: string; content: string; url: string } | null> => {
      try {
        const response = (await withAbort(
          withTimeout(
            fetch(result.url, {
              headers: {
                accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
                "user-agent":
                  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
              },
              signal,
            }),
            FETCH_HTTP_TIMEOUT_MS,
            "HTTP 抓取超时",
          ),
        )) as Response;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await withAbort(response.text());
        const { title, content } = extractTextFromHtml(html);
        if (!content || content.length < MIN_HTTP_CONTENT_LENGTH) {
          return null;
        }

        return {
          title: title || result.title,
          content,
          url: normalizeUrl(response.url) || result.url,
        };
      } catch (error) {
        logger.debug(
          `[BrowserSearch] HTTP 抓取失败: ${result.url} (${error instanceof Error ? error.message : String(error)})`,
        );
        return null;
      }
    };

    const fetchSingleResult = async (result: SearchResult): Promise<FetchedSearchResult> => {
      assertNotAborted();
      try {
        logger.info(`[BrowserSearch] 抓取结果页: ${result.url}`);

        const httpData = await fetchViaHttp(result);
        if (httpData) {
          return {
            title: httpData.title,
            url: httpData.url,
            snippet: result.snippet || undefined,
            content: httpData.content,
          };
        }

        return {
          title: result.title,
          url: result.url,
          snippet: result.snippet || undefined,
          error: "HTTP 抓取失败或正文内容过短",
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`[BrowserSearch] 抓取失败: ${result.url} - ${errorMessage}`);
        return {
          title: result.title,
          url: result.url,
          snippet: result.snippet || undefined,
          error: errorMessage,
        };
      }
    };

    try {
      if (!query?.trim()) {
        throw new Error("搜索操作需要提供 query 参数");
      }

      const keyword = query.trim();
      const searchUrl = buildGoogleSearchUrl(keyword);

      logger.info(`[BrowserSearch] 使用 ${SEARCH_ENGINE} 搜索并抓取（无浏览器回退）: ${keyword}`);

      let searchResults = await searchViaSerper(keyword);
      if (searchResults.length === 0) {
        searchResults = await searchViaGoogleHtml(searchUrl);
      }

      searchResults = rankResultsByQuery(dedupeResults(searchResults), keyword).slice(
        0,
        SEARCH_RESULT_LIMIT,
      );

      if (searchResults.length === 0) {
        const emptyContent = `搜索 "${keyword}" 未找到可抓取的结果。`;
        return createToolResult(
          {
            content: emptyContent,
            url: searchUrl,
            title: `搜索结果 - ${keyword}`,
            results: [],
          },
          {
            transportMessage: `Google 搜索完成，但没有可抓取的搜索结果。关键词: ${keyword}`,
            continuationSummary: buildBrowserSearchContinuationSummary(keyword),
            continuationResult: {
              content: emptyContent,
              url: searchUrl,
              title: `搜索结果 - ${keyword}`,
              results: [],
            },
          },
        );
      }

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

      const resultRows = fetchedResults.filter(Boolean);

      return createToolResult(
        {
          content: "抓取网页内容完成。\n",
          url: searchUrl,
          title: `Google 搜索并抓取 - ${keyword}`,
          results: resultRows,
        },
        {
          transportMessage: "网页搜索并抓取完成。",
          continuationSummary: buildBrowserSearchContinuationSummary(keyword),
          continuationResult: buildBrowserSearchContinuationResult(keyword, searchUrl, resultRows),
        },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[BrowserSearch] 执行失败: ${errorMessage}`);

      return createToolResult(
        {
          content: `错误: ${errorMessage}`,
        },
        {
          transportMessage: `浏览器搜索失败: ${errorMessage}`,
          continuationSummary: `搜索失败: ${query?.trim() || "unknown"}`,
          continuationResult: {
            content: `错误: ${errorMessage}`,
          },
        },
      );
    }
  },
});
