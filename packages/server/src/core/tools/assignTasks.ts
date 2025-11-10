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
    "3. **工具分配（重要）：** \n" +
    "   - **只能使用上下文中已明确列出的工具名称**，不要编造或假设工具存在\n" +
    "   - 工具名称必须**完全匹配**（区分大小写）\n" +
    "   - 如果不确定有哪些工具可用，或没有合适的工具，请将 `<tools>` 留空或使用 `<tool></tool>`\n" +
    "   - 使用不存在的工具会导致任务执行失败\n",

  useExamples: [
    `示例 1 - 没有可用工具时：
用户请求：我想计划一个去日本的两周旅行，帮我安排机票和酒店。
当前可用工具：无

<assignTasks>
  <tasklist>
    <task>
      <target>查询北京到东京的往返机票，预算不超过5000元。</target>
      <subAgentPrompt>你是一个专业的机票查询代理，请使用你的通用能力查询机票信息，包括价格、航班时间等。</subAgentPrompt>
      <tools>
        <tool></tool>
      </tools>
    </task>
    <task>
      <target>查找东京新宿区评分高于4.5的酒店，并提供预订建议。</target>
      <subAgentPrompt>你是一个专业的酒店预订代理，请提供酒店推荐和预订建议。</subAgentPrompt>
      <tools>
        <tool></tool>
      </tools>
    </task>
  </tasklist>
</assignTasks>`,
    `示例 2 - 有可用工具时：
用户请求：帮我搜索机票和酒店信息。
当前可用工具：FlightSearchTool, HotelBookingTool, WebSearch

<assignTasks>
  <tasklist>
    <task>
      <target>搜索北京到上海的机票信息。</target>
      <subAgentPrompt>你是机票查询专家，请使用 FlightSearchTool 和 WebSearch 工具查询机票。</subAgentPrompt>
      <tools>
        <tool>FlightSearchTool</tool>
        <tool>WebSearch</tool>
      </tools>
    </task>
    <task>
      <target>查找上海的五星级酒店。</target>
      <subAgentPrompt>你是酒店预订专家，请使用 HotelBookingTool 查找酒店信息。</subAgentPrompt>
      <tools>
        <tool>HotelBookingTool</tool>
      </tools>
    </task>
  </tasklist>
</assignTasks>`,
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
              description: "A list of tool names available to the sub-agent for this step. **CRITICAL: Only use tool names that are explicitly defined in the current context. Do not invent or assume tool names. If unsure, leave empty.**",
              type: "array",
              params: [
                {
                  name: "tool",
                  optional: false,
                  description: "The exact name of a tool that exists in the current context. Must match exactly (case-sensitive). Use empty string if no tools are needed.",
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
      params.tasklist.map(async (task, index) => {
        const { target, tools, subAgentPrompt } = task;
        const currentTask = getCurrentTask();
        
        // 过滤并验证工具
        const requestedTools = tools.filter(t => t && t.trim() !== '');
        const availableTools = [];
        const invalidTools = [];
        
        for (const toolName of requestedTools) {
          const tool = getToolFromName(toolName);
          if (tool) {
            availableTools.push(tool);
          } else {
            invalidTools.push(toolName);
          }
        }
        
        // 如果有无效工具，记录警告
        if (invalidTools.length > 0) {
          console.warn(`[AssignTasks] 任务 "${target}" 请求了不存在的工具: ${invalidTools.join(', ')}`);
        }
        
        // runSubConversation 返回总结
        const summary = await ConversationManager.runSubConversation({
          subPrompt: subAgentPrompt,
          parentTaskId: currentTask,
          target,
          tools: availableTools,
          index
        });
        
        return {
          target,
          summary,
          requestedTools: requestedTools.length,
          availableTools: availableTools.length,
          invalidTools: invalidTools.length > 0 ? invalidTools : undefined,
        };
      })
    );

    // 返回每个步骤的执行结果
    const hasInvalidTools = results.some(r => r.invalidTools);
    const warningMessage = hasInvalidTools 
      ? '\n⚠️ 警告：部分任务请求了不存在的工具，这些工具已被忽略。' 
      : '';
    
    return {
      message: `所有子任务已执行完毕，结果如下：${warningMessage}\n${results
        .map(
          (r, i) =>
            `步骤${i + 1}（目标：${r.target}）：${typeof r.summary === "string" ? r.summary : JSON.stringify(r.summary)}${r.invalidTools ? ` [无效工具: ${r.invalidTools.join(', ')}]` : ''}`
        )
        .join("\n")}`,
      toolResult: {
        ...params,
        results,
      },
    };
  },
});
