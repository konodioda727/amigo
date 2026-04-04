import { describe, expect, it } from "bun:test";
import {
  AMIGO_MAIN_DESIGN_ORCHESTRATION_PROMPT,
  AMIGO_SHARED_DESIGN_CONSTITUTION,
  appendAmigoDesignPatternContext,
  buildAmigoDesignPatternAppendix,
} from "../amigoAppPrompt";

describe("amigoAppPrompt", () => {
  it("keeps orchestration rules separate from shared design rules", () => {
    expect(AMIGO_MAIN_DESIGN_ORCHESTRATION_PROMPT).toContain("主流程编排约束");
    expect(AMIGO_MAIN_DESIGN_ORCHESTRATION_PROMPT).toContain(
      "readDesignSession / upsertDesignSession",
    );
    expect(AMIGO_MAIN_DESIGN_ORCHESTRATION_PROMPT).toContain("先建立对整个相关代码仓库的理解");
    expect(AMIGO_MAIN_DESIGN_ORCHESTRATION_PROMPT).toContain("问题根因");
    expect(AMIGO_SHARED_DESIGN_CONSTITUTION).toContain("视觉设计规则");
    expect(AMIGO_SHARED_DESIGN_CONSTITUTION).toContain("背景与表面");
    expect(AMIGO_SHARED_DESIGN_CONSTITUTION).not.toContain("orchestrateFinalDesignDraft");
  });

  it("selects relevant pattern packs from the user message", () => {
    const appendix = buildAmigoDesignPatternAppendix(
      "帮我设计一个 dashboard landing page，顺便把卡片和布局也重做",
    );

    expect(appendix).toContain("卡片模式库");
    expect(appendix).toContain("一卡一概念");
    expect(appendix).toContain("菜单图标默认放右上角");
    expect(appendix).toContain("4px 基线");
    expect(appendix).toContain("骨架屏应尽量贴近最终卡片布局");
    expect(appendix).toContain("Dashboard 模式库");
    expect(appendix).toContain("Landing Page 模式库");
    expect(appendix).toContain("布局模式库");
  });

  it("merges matched pattern packs into context for both main and sub prompts", () => {
    const nextContext = appendAmigoDesignPatternContext(
      { repoUrl: "https://example.com/repo.git" },
      "把这个 landing page 的 hero 和整体布局重做",
    );

    expect(nextContext).toBeDefined();
    expect(nextContext?.repoUrl).toBe("https://example.com/repo.git");
    expect(nextContext?.systemPromptAppendix).toMatchObject({
      main: expect.stringContaining("Landing Page 模式库"),
      sub: expect.stringContaining("布局模式库"),
    });
  });
});
