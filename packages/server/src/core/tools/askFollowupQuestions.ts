import { createTool } from './base';

export const AskFollowupQuestions = createTool({
  name: "askFollowupQuestion",
  description: "询问用户后续问题",
  whenToUse:
    "当你觉得用户问题不清晰，或者需要更多信息来提供更好的帮助时，可以使用此工具向用户提出后续问题。",
  useExamples: [
    `<askFollowupQuestion>
      <question>请问您想了解哪方面的旅游信息？</question>
      <suggestOptions>
        <option>景点推荐</option>
        <option>住宿建议</option>
        <option>交通信息</option>
        <option>美食推荐</option>
        <option>行程规划</option>
      </suggestOptions>
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
      optional: false,
      description: "A list of suggested options for the user to choose from.",
      type: 'array',
      params: [
        {
          name: "option",
          optional: false,
          description: "A suggested option for the user.",
        }
      ]
    },
  ],
  async invoke({params}) {
    return {
      message: `已向用户提出后续问题: ${params.question}`,
      toolResult: ''
    };
  },
});
