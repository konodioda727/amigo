import { ConversationManager } from "../conversationManager";
import { createTool } from "./base";

export const AssignTasks = createTool({
  name: "assignTasks",
  description:
    "将用户复杂的请求分解为多个**可并行执行**的独立步骤（任务）。每个任务会分配给一个专业的子代理或特定的工具来完成。",
  whenToUse:
    "当请求中存在可并行执行的步骤时，应使用此工具进行分配。\n" +
    "**关键原则：**\n" +
    "1. **拆分原则：** 确保每个 `task` 都有一个明确、可独立完成的 `target`。\n" +
    "2. **子代理设置：** 为每个 `task` 编写清晰、专业的 `subAgentPrompt`，定义子代理的角色和行为约束。\n" +
    "3. **工具分配：** 严格限定子代理使用的工具列表，列表中的工具必须为 `用户自定义工具` 板块中已经定义的工具，否则会导致工具调用失败，如果没有可用工具，允许置空。\n",

  useExamples: [
    `
    - 用户请求：我想计划一个去日本的两周旅行，帮我安排机票和酒店。
    - 当前用户定义工具中没有可用工具，则置空 tools 列表。
    <assignTasks>
      <tasklist>
        <task>
          <target>查询北京到上海的往返机票，预算不超过2000元。</target>
          <subAgentPrompt>你是一个专业的机票查询代理，请严格按照用户的要求，查询机票信息。</subAgentPrompt>
          <tools>
            <tool></tool>
          </tools>
        </task>
        <task>
          <target>查找上海静安区评分高于4.5的五星级酒店，并提供预订链接。</target>
          <subAgentPrompt>你是一个专业的酒店预订代理，提供预订链接。</subAgentPrompt>
          <tools>
            <tool></tool>
          </tools>
        </task>
      </todolist>
    </assignTasks>`,
    `
    - 用户请求：我想计划一个去日本的两周旅行，帮我安排机票和酒店。
    - 假设当前用户定义工具中有两个可用在该任务的工具：FlightSearchTool 和 HotelBookingTool。
    <assignTasks>
     <task>
          <target>查找上海静安区评分高于4.5的五星级酒店，并提供预订链接。</target>
          <subAgentPrompt>你是一个专业的酒店预订代理，请只使用 HotelBookingTool 查找并提供预订链接。</subAgentPrompt>
          <tools>
            <tool>HotelBookingTool</tool>
            <tool>InternetSearch</tool>
          </tools>
      </task>
    </assignTasks>
    `,
  ],

  // 定义模型需要输出的 XML 标签和结构
  params: [
    {
      name: "tasklist",
      optional: false,
      description: "A list of task items to be processed sequentially.",
      type: "array",
      params: [
        {
          name: "task",
          description: "A single task step to be handled by a sub-agent.",
          optional: false,
          params: [
            {
              name: "target",
              optional: false,
              description: "The specific goal or target of this task item.",
            },
            {
              name: "subAgentPrompt",
              optional: false,
              description:
                "The System Prompt (instructions) for the sub-agent that will execute this step.",
            },
            {
              name: "tools",
              optional: false,
              description: "A list of tool names available to the sub-agent for this step.",
              type: "array",
              params: [
                {
                  name: "tool",
                  optional: false,
                  description: "The name of a tool that the sub-agent can use.",
                },
              ],
            },
          ],
        },
      ],
    },
  ],

  /**
   * 工具的实际执行逻辑
   * 在实际应用中，这里应该触发一个子任务流程，
   * 根据 params 中的 todolist 逐一创建和启动子 ConversationManager。
   */
  async invoke({ params, getCurrentTask, getToolFromName }) {
    // 并发执行所有子任务，收集每个结果
    const results = await Promise.all(
      params.tasklist.map(async (task) => {
        const { target, tools, subAgentPrompt } = task;
        const currentTask = getCurrentTask();
        const availableTools = tools
          .map((tool) => getToolFromName(tool))
          .filter((item) => item !== undefined);
        // runSubConversation 返回总结
        const summary = await ConversationManager.runSubConversation({
          subPrompt: subAgentPrompt,
          parentTaskId: currentTask,
          target,
          tools: availableTools,
        });
        return {
          target,
          summary,
        };
      })
    );

    // 返回每个步骤的执行结果
    return {
      message: `所有子任务已执行完毕，结果如下：\n${results
        .map(
          (r, i) =>
            `步骤${i + 1}（目标：${r.target}）：${typeof r.summary === "string" ? r.summary : JSON.stringify(r.summary)}`
        )
        .join("\n")}`,
      toolResult: {
        ...params,
        results,
      },
    };
  },
});
