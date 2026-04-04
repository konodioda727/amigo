import { describe, expect, it } from "bun:test";
import { parseChecklist } from "../../../../../../backend/src/core/templates/checklistParser";
import { buildModuleImplementationTaskListDoc } from "../draftTools";

describe("final design task list generation", () => {
  it("keeps generated checklist items single-line when session strategy fields are multiline", async () => {
    const content = buildModuleImplementationTaskListDoc({
      draftId: "aliyun-homepage",
      modules: [
        {
          id: "hero",
          label: "首屏英雄区",
          summary: "品牌主视觉和 CTA",
          priority: "primary",
        },
      ],
      session: {
        pageGoal: "打造专业可信的企业级云计算平台首页",
        targetAudience: "企业 IT 决策者与开发者",
        brandMood: "专业、可信赖、技术领先",
        layoutPlan: "采用单页长滚动布局，模块按优先级垂直排列：\n1. 导航\n2. Hero\n3. 产品矩阵",
        styleDirection: "整体视觉方向：专业、现代、开放。",
        colorStrategy:
          "主色调：阿里云品牌橙色 (#FF6A00)\n辅助色：深空灰 (#1A1A2E)、科技蓝 (#0066FF)",
      },
      layout: {
        layoutId: "session-layout",
        title: "采用单页长滚动布局，模块按优先级垂直排列：\n1. 导航\n2. Hero\n3. 产品矩阵",
        description: "内部布局骨架",
        source: '<section data-module-id="hero"><div>Hero</div></section>',
        moduleIds: ["hero"],
        canvasWidth: 1440,
        canvasHeight: 1024,
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:00.000Z",
      },
      theme: {
        title: "主色调：阿里云品牌橙色 (#FF6A00)\n辅助色：深空灰 (#1A1A2E)、科技蓝 (#0066FF)",
      },
    });

    const phaseOneSection = content
      .split("### Phase 1: 模块实施\n")[1]
      ?.split("\n\n### Phase 2: 细节优化")[0]
      ?.trim();
    const phaseTwoSection = content
      .split("### Phase 2: 细节优化\n")[1]
      ?.split("\n\n## Progress")[0]
      ?.trim();
    const parsed = parseChecklist(content);

    expect(phaseOneSection?.split("\n")).toHaveLength(1);
    expect(phaseTwoSection?.split("\n")).toHaveLength(2);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]?.rawLine).toContain("[tools:");
    expect(parsed.items[0]?.rawLine).toContain(
      'Task 1.1: 生成模块 首屏英雄区（hero）的最终设计稿并写回 draftId="aliyun-homepage" 的 module draft。',
    );
    expect(parsed.items[1]?.rawLine).toContain("[deps: Task 1.1]");
    expect(parsed.items[2]?.rawLine).toContain("[deps: Task 2.1]");
    expect(content).not.toContain("整页合体目标：");
    expect(content).not.toContain("当前模块边界契约：");
    expect(content).not.toContain("细节要求：");
  });
});
