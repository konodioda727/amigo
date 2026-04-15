import { beforeEach, describe, expect, it, mock } from "bun:test";

const getMock = mock(async () => ({
  bundle: null,
  resolvedBranch: null,
}));

mock.module("../../repoKnowledge/store", () => ({
  repoKnowledgeStore: {
    get: getMock,
  },
}));

describe("readRepoKnowledgeTool", () => {
  beforeEach(() => {
    getMock.mockClear();
  });

  it("treats missing knowledge bundles as bootstrapable success instead of tool failure", async () => {
    const { readRepoKnowledgeTool } = await import("../repoKnowledgeTools");

    const result = await readRepoKnowledgeTool.invoke({
      params: {},
      context: {
        conversationContext: {
          userId: "user-1",
          repoUrl: "https://github.com/example/repo",
          branch: "main",
        },
        getSandbox: async () => ({}),
        signal: undefined,
      },
    });

    expect(getMock).toHaveBeenCalled();
    expect(result.error).toBeUndefined();
    expect(result.message).toContain("正常的首次初始化场景");
    expect(result.toolResult).toEqual(
      expect.objectContaining({
        success: true,
        bundleState: "missing",
        bootstrapRequired: true,
        suggestedSections: ["overview", "package-map", "entrypoints"],
      }),
    );
  });
});
