// 文件名: tools/completeTask.ts

import { createTool } from "./base"; // 假设 createTool 的路径
import { logger } from "@/utils/logger";

/**
 * 任务完成工具
 * 用于在 Agent 流程中，确认所有 To-Do List 任务完成，并向用户返回最终结论。
 * 这是一个系统保留标签工具，通常由 Agent 在任务结束时调用。
 */
export const CompletionResult = createTool({
  name: "completionResult",
  description: "🎯 【必须使用】在任务完成后，使用此工具标记任务结束并返回最终结论。这是结束任务的唯一正确方式。**内容必须使用 Markdown 格式输出。**",
  whenToUse:
    "**关键规则：任何任务完成后，你必须使用此工具来结束任务。**\n\n" +
    "**格式要求：**\n" +
    "- ✅ **必须使用 Markdown 格式**输出内容（标题、列表、代码块、加粗等）\n" +
    "- ✅ 使用合适的 Markdown 语法让内容结构清晰、易读\n" +
    "- ✅ 代码片段使用代码块（```）包裹\n" +
    "- ✅ 重要信息使用加粗（**文本**）或列表强调\n\n" +
    "**适用场景：**\n" +
    "1. 所有待办事项都已完成\n" +
    "2. 用户的请求已经得到完整回答\n" +
    "3. 简单任务执行完毕（即使只有一个步骤）\n" +
    "4. 信息查询任务已获得结果\n" +
    "5. 分析或计算任务已得出结论\n\n" +
    "**严禁行为：**\n" +
    "- ❌ 直接向用户回复最终结论而不调用此工具\n" +
    "- ❌ 使用普通文本形式说'任务完成'、'已完成'、'结束'\n" +
    "- ❌ 在任务未完成时调用此工具\n" +
    "- ❌ 认为简单任务不需要调用此工具\n" +
    "- ❌ 输出纯文本而不使用 Markdown 格式\n\n" +
    "**不使用此工具的后果：**\n" +
    "- 系统无法识别任务已完成，任务状态将保持为'进行中'\n" +
    "- 用户无法获得明确的完成信号\n" +
    "- 会话无法正常结束，可能导致后续交互异常\n" +
    "- 任务历史记录不完整，影响系统追踪和分析",
  useExamples: [
    // ❌ 错误示例 1：直接回复而不调用工具
    `❌ 错误示例 1：
Agent 回复："任务已完成！我已经为您创建了 README 文件，内容包括项目标题、描述和使用说明。"

为什么错误：直接向用户回复最终结论，没有调用 completionResult 工具。系统无法识别任务已完成。`,

    // ❌ 错误示例 2：使用普通文本说"任务完成"
    `❌ 错误示例 2：
Agent 回复："好的，我已经完成了所有步骤。任务完成。文件已成功创建并保存。"

为什么错误：虽然说了"任务完成"，但这只是普通文本，不是工具调用。系统无法识别。`,

    // ❌ 错误示例 3：任务完成后使用其他工具
    `❌ 错误示例 3：
[Agent 已完成所有步骤]
<askFollowupQuestion>
  <question>文件已创建完成，您还需要我做什么吗？</question>
  <suggestOptions>
    <option>添加更多内容</option>
    <option>不需要了</option>
  </suggestOptions>
</askFollowupQuestion>

为什么错误：任务已完成，应该调用 completionResult，而不是 askFollowupQuestion。`,

    // ✅ 正确示例 1：简单任务完成
    `✅ 正确示例 1（简单任务）：
[Agent 执行了 readFile 工具]
<completionResult>
config.json 的内容如下：
{
  "port": 3000,
  "database": "mongodb://localhost:27017"
}
</completionResult>

为什么正确：即使是简单的文件读取任务，也使用了 completionResult 明确标记任务结束。`,

    // ✅ 正确示例 2：复杂任务完成
    `✅ 正确示例 2（复杂任务）：
[Agent 完成了多个步骤：创建目录、写入文件、初始化 Git]
<completionResult>
项目初始化已完成：
1. ✅ 创建了 src、tests、docs 目录结构
2. ✅ 生成了 package.json 和 tsconfig.json 配置文件
3. ✅ 初始化了 Git 仓库并完成首次提交

您现在可以开始开发了。
</completionResult>

为什么正确：完成所有步骤后，使用 completionResult 提供详细的完成总结。`,

    // ✅ 正确示例 3：信息查询任务完成
    `✅ 正确示例 3（信息查询）：
[Agent 查询了天气信息]
<completionResult>
今天北京天气晴朗，温度 25°C，湿度 45%，适合外出活动。建议穿着轻便衣物。
</completionResult>

为什么正确：查询任务完成后，立即使用 completionResult 返回结果，没有多余的确认步骤。`,
  ],
  params: [],
  async invoke({params: final_answer}) {
    logger.info("任务完成，最终结论：", final_answer);

    return {
      message: "任务完成，已向用户提供最终结论。",
      toolResult: final_answer,
    };
  },
});