import { createTool } from './base';

export const AskFollowupQuestions = createTool({
  name: "askFollowupQuestion",
  description: "询问用户后续问题",
  whenToUse:
    "当你觉得用户问题不清晰，或者需要更多信息来提供更好的帮助时，可以使用此工具向用户提出后续问题。",
  useExamples: [
    `<askFollowupQuestion>
      <question>请问您想了解哪方面的旅游信息？</question>
      <suggestOptions>['安排住宿','规划行程','查询15日之内天气','查看今日天气']</suggestOptions>
    </askFollowupQuestion>`,
  ],
  params: [
    {
      name: "question",
      optional: false,
      description: "The main question to ask the user.",
    },
    {
      name: "suggestOptions",
      optional: true,
      description: "A list of suggested options for the user to choose from.",
    },
  ],
  async invoke({params}) {
    return {
      message: `已向用户提出后续问题: ${params.question}`,
      toolResult: ''
    };
  },
});
