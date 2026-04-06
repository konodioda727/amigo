import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ToolExecutionContext } from "@amigo-llm/types";
import { AskFollowupQuestions } from "../askFollowupQuestions";
import { BrowserSearch } from "../browserSearch";

const originalFetch = globalThis.fetch;

const createContext = (sandbox?: Record<string, unknown>): ToolExecutionContext => ({
  taskId: "task-1",
  parentId: undefined,
  getSandbox: async () =>
    ({
      isRunning: () => true,
      ...sandbox,
    }) as never,
  getToolByName: () => undefined,
  signal: undefined,
});

describe("continuation summaries", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns a short continuation summary for askFollowupQuestion", async () => {
    const result = await AskFollowupQuestions.invoke({
      params: {
        question: "要用哪个数据库？",
        suggestOptions: ["Postgres", "MySQL"],
      },
      context: createContext(),
    });

    expect(result.continuation.summary).toBe("【已向用户提问】");
    expect(result.continuation.result).toBe("要用哪个数据库？");
  });

  it("returns a short continuation summary and compact continuation result for browserSearch", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://www.google.com/search?")) {
        return new Response(
          [
            '<a href="https://example.com/post"><h3>Example Result</h3></a>',
            '<div class="VwiC3b">Example snippet</div>',
          ].join(""),
          { status: 200 },
        );
      }

      if (url === "https://example.com/post") {
        return new Response(
          `<html><head><title>Example Result</title></head><body>${"a".repeat(180)}</body></html>`,
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await BrowserSearch.invoke({
      params: { query: "example query" },
      context: createContext(),
    });

    expect(result.continuation.summary).toBe("【已搜索 example query】");
    expect(result.transport.result.results?.[0]?.content).toBeDefined();
    expect(result.continuation.result.content).toContain('搜索 "example query" 完成');
    expect(result.continuation.result.results?.[0]?.content).toBeUndefined();
    expect(result.continuation.result.results?.[0]?.title).toBe("Example Result");
  });
});
