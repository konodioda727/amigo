import { createTool } from "./base";

export const AskFollowupQuestions = createTool({
  name: "askFollowupQuestion",
  description: "询问用户后续问题以获取必要信息",
  whenToUse:
    "仅在缺少关键决策、需求澄清或设计偏好，且无法通过现有工具自行获取时使用。优先先做可自行完成的研究；在 requirements/design 渐进式编写中，每次只问一个高价值问题。不要用于无意义确认、任务收尾或满意度询问。",
  completionBehavior: "idle",
  params: [
    {
      name: "question",
      optional: false,
      description:
        "要向用户提出的问题。必须清晰、具体，避免开放式问题。\n✅ 好的问题：「您希望使用哪种数据库？」\n❌ 不好的问题：「您还需要什么？」",
    },
    {
      name: "suggestOptions",
      optional: false,
      description:
        '为用户提供的建议选项列表。必须提供 2-4 个具体、可操作的选项。选项应该是互斥的（不重叠）、完整的（覆盖主要情况），每个选项都应该是明确的行动方案。\n✅ 好的选项：["PostgreSQL", "MySQL", "MongoDB", "SQLite"]\n❌ 不好的选项：["是", "否", "可能"]',
      type: "array",
      params: [
        {
          name: "option",
          optional: false,
          description: "一个具体的建议选项",
        },
      ],
    },
  ],
  async invoke({ params }) {
    return {
      message: `已向用户提出后续问题: ${params.question}`,
      toolResult: "",
    };
  },
});
