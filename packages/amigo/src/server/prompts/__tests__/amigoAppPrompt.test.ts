import { describe, expect, it } from "bun:test";
import path from "node:path";
import { createFileSystemRuleProvider } from "@amigo-llm/backend";

describe("amigoAppPrompt", () => {
  it("loads app system prompt appendix and docs from the filesystem provider", async () => {
    const provider = createFileSystemRuleProvider({
      rootDir: path.resolve(import.meta.dir, "..", "systemPrompt"),
    });

    const appendix = provider.getSystemPromptAppendix({ conversationType: "main" });
    const references = provider.getPromptReferences({ conversationType: "main" });
    const codingRule = await provider.getRule("coding");

    expect(appendix).toContain("当前 sandbox");
    expect(appendix).toContain("优先 `readRules` 读取 `product`");
    expect(appendix).toContain("优先 `readRules` 读取 `coding`");
    expect(appendix).toContain("页面、组件、布局、主题、视觉、交互、样式、信息架构、设计稿、改版");
    expect(appendix).toContain("先进入设计链路，再改代码");
    expect(appendix).toContain("readDesignSession");
    expect(appendix).toContain(
      "只有纯逻辑、数据流、脚本、后端能力或无视觉影响的改动，才可以不走设计链",
    );
    expect(references.map((rule) => rule.id)).toEqual(["coding", "product"]);
    expect(codingRule?.title).toBe("Coding Rules");
    expect(codingRule?.content).toContain("先确认当前问题属于哪一层");
    expect(codingRule?.content).toContain("设计优先原则");
    expect(codingRule?.content).toContain("不要只靠记忆解释当前行为");

    const productRule = await provider.getRule("product");
    expect(productRule?.content).toContain("先读取本规则，再决定是否继续到 sandbox 中取证");
  });
});
