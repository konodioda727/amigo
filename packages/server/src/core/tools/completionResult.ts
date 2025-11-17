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
  description: "🎯 【必须使用】在任务完成后，使用此工具标记任务结束并返回最终结论。这是结束任务的唯一正确方式。",
  whenToUse:
    "**关键规则：任何任务完成后，你必须使用此工具来结束任务。**\n\n" +
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
    "- ❌ 认为简单任务不需要调用此工具\n\n" +
    "**不使用此工具的后果：**\n" +
    "- 系统无法识别任务已完成，任务状态将保持为'进行中'\n" +
    "- 用户无法获得明确的完成信号\n" +
    "- 会话无法正常结束，可能导致后续交互异常\n" +
    "- 任务历史记录不完整，影响系统追踪和分析",
  useExamples: [
    `<completionResult>
      根据您的规划，我们为您安排了为期三天的北京旅行，详细行程已在报告中列出。
    </completionResult>`,
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