import { ConversationManager } from "../conversationManager";
import { createTool } from "./base";
import { logger } from "@/utils/logger";

export const AssignTasks = createTool({
  name: "assignTasks",
  description:
    "将用户复杂的请求分解为多个**可并行执行**的独立步骤（任务）。每个任务会分配给一个专业的子代理或特定的工具来完成。",
  whenToUse:
    "当请求中存在可并行执行的步骤时，应使用此工具进行分配。\n\n" +
    "## 🚫 关键约束：工具名称验证\n\n" +
    "**工具名称必须严格遵守以下规则：**\n" +
    "1. **只能使用下方明确列出的工具名称** - 不要编造、假设或猜测工具名称\n" +
    "2. **工具名称必须完全匹配** - 区分大小写，必须与可用工具列表中的名称完全一致\n" +
    "3. **不确定时留空** - 如果不确定有哪些工具可用，或没有合适的工具，请使用 `<tool></tool>` 或将 tools 留空\n" +
    "4. **验证后再使用** - 在分配工具前，务必检查工具名称是否在下方的可用工具列表中\n\n" +
    "**⚠️ 使用不存在的工具名称的后果：**\n" +
    "- 子任务将无法访问该工具\n" +
    "- 系统会记录警告日志\n" +
    "- 可能导致任务执行失败或结果不完整\n" +
    "- 影响整体任务的完成质量\n\n" +
    "**当前可用的工具名称列表：**\n" +
    "{TOOL_LIST_WILL_BE_INJECTED}\n\n" +
    "## 拆分原则\n\n" +
    "1. **明确目标：** 确保每个 `task` 都有一个明确、可独立完成的 `target`\n" +
    "2. **清晰指令：** 为每个 `task` 编写清晰、专业的 `subAgentPrompt`，定义子代理的角色和行为约束\n" +
    "3. **正确分配：** 只分配列表中存在的工具，避免使用不存在的工具名称\n",

  useExamples: [
    `**示例 1 - 没有可用工具的场景**

场景说明：当前系统没有提供任何可用工具，子代理需要依靠通用能力完成任务。

用户请求：我想计划一个去日本的两周旅行，帮我安排机票和酒店。
当前可用工具：无

正确做法：使用空的 <tool></tool> 标签

<assignTasks>
  <tasklist>
    <!-- 第一个并行任务：机票查询 -->
    <task>
      <!-- target: 明确、可独立完成的目标 -->
      <target>查询北京到东京的往返机票，预算不超过5000元。</target>
      
      <!-- subAgentPrompt: 为子代理定义角色和行为约束 -->
      <subAgentPrompt>你是一个专业的机票查询代理，请使用你的通用能力查询机票信息，包括价格、航班时间等。</subAgentPrompt>
      
      <!-- tools: 工具名称验证的关键部分 -->
      <!-- ⚠️ 关键：当没有可用工具时，使用空的 <tool></tool> 标签 -->
      <!-- ❌ 不要编造工具名称，如 "FlightSearchTool" -->
      <!-- ✅ 正确：使用空标签让子代理依靠通用能力 -->
      <tools>
        <tool></tool>
      </tools>
    </task>
    
    <!-- 第二个并行任务：酒店查询 -->
    <task>
      <target>查找东京新宿区评分高于4.5的酒店，并提供预订建议。</target>
      <subAgentPrompt>你是一个专业的酒店预订代理，请提供酒店推荐和预订建议。</subAgentPrompt>
      
      <!-- 同样使用空工具标签，保持一致性 -->
      <tools>
        <tool></tool>
      </tools>
    </task>
  </tasklist>
</assignTasks>

⚠️ 注意：不要编造工具名称如 "FlightSearchTool" 或 "HotelBookingTool"，因为它们不在可用工具列表中。`,

    `**示例 2 - 有可用工具的场景**

场景说明：系统提供了特定的工具，必须使用列表中的确切名称（区分大小写）。

用户请求：帮我搜索机票和酒店信息。
当前可用工具：FlightSearchTool, HotelBookingTool, WebSearch

正确做法：只使用列表中存在的工具名称，完全匹配

<assignTasks>
  <tasklist>
    <!-- 第一个任务：机票搜索 -->
    <task>
      <target>搜索北京到上海的机票信息。</target>
      
      <!-- 在 subAgentPrompt 中明确告知子代理可以使用哪些工具 -->
      <subAgentPrompt>你是机票查询专家，请使用 FlightSearchTool 和 WebSearch 工具查询机票。</subAgentPrompt>
      
      <!-- 🔍 工具名称验证的核心部分 -->
      <!-- ✅ 正确：使用可用工具列表中的确切名称 -->
      <!-- ⚠️ 必须完全匹配，包括大小写 -->
      <tools>
        <!-- FlightSearchTool 在可用工具列表中 ✓ -->
        <tool>FlightSearchTool</tool>
        
        <!-- WebSearch 在可用工具列表中 ✓ -->
        <tool>WebSearch</tool>
        
        <!-- ❌ 错误示例（不要这样做）：
        <tool>flightsearchtool</tool>  大小写不匹配
        <tool>FlightTool</tool>        工具名称不存在
        <tool>SearchFlight</tool>      编造的工具名称
        -->
      </tools>
    </task>
    
    <!-- 第二个任务：酒店查询 -->
    <task>
      <target>查找上海的五星级酒店。</target>
      <subAgentPrompt>你是酒店预订专家，请使用 HotelBookingTool 查找酒店信息。</subAgentPrompt>
      
      <!-- 只分配这个任务需要的工具 -->
      <tools>
        <!-- HotelBookingTool 在可用工具列表中 ✓ -->
        <tool>HotelBookingTool</tool>
        
        <!-- 注意：这里不需要 WebSearch，所以不包含它 -->
        <!-- 每个任务只分配它实际需要的工具 -->
      </tools>
    </task>
  </tasklist>
</assignTasks>

✅ 正确：所有工具名称都在可用工具列表中
❌ 错误示例：使用 "flightsearchtool"（大小写不匹配）或 "BookingTool"（不存在的工具）

📝 关键要点总结：
1. 工具名称必须与可用工具列表完全匹配（区分大小写）
2. 没有可用工具时使用空的 <tool></tool> 标签
3. 不要编造、假设或猜测工具名称
4. 每个任务只分配它实际需要的工具
5. 在分配前务必检查工具名称是否在可用列表中`,
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
    // 限制并发数为 1，顺序执行所有子任务
    const CONCURRENCY_LIMIT = 2;
    const results = [];

    for (let i = 0; i < params.tasklist.length; i += CONCURRENCY_LIMIT) {
      const batch = params.tasklist.slice(i, i + CONCURRENCY_LIMIT);
      
      const batchResults = await Promise.all(
        batch.map(async (task, batchIndex) => {
          const index = i + batchIndex;
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
            logger.warn(`[AssignTasks] 任务 "${target}" 请求了不存在的工具: ${invalidTools.join(', ')}`);
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

      results.push(...batchResults);
    }

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
