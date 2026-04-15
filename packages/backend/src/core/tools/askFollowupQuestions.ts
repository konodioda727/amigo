import { createTool } from "./base";
import { createToolResult } from "./result";

export const AskFollowupQuestions = createTool({
  name: "askFollowupQuestion",
  description: "询问用户后续问题以获取必要信息",
  whenToUse:
    "当当前阶段无法继续推进，且确实缺少只有用户本人才能提供的事实或决策时使用。一次只问一个必要问题，并直接使用该工具发问，不要先输出普通文本问题再调用工具。不要用于无意义确认、任务收尾、满意度询问，或把本可由 agent 自查的信息重新问给用户。",
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
    const message = `已向用户提出后续问题: ${params.question}`;
    return createToolResult("", {
      transportMessage: message,
      continuationSummary: "【已向用户提问】",
      continuationResult: params.question,
    });
  },
});
