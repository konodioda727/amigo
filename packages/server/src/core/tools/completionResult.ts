// 文件名: tools/completeTask.ts

import { createTool } from "./base"; // 假设 createTool 的路径

/**
 * 任务完成工具
 * 用于在 Agent 流程中，确认所有 To-Do List 任务完成，并向用户返回最终结论。
 * 这是一个系统保留标签工具，通常由 Agent 在任务结束时调用。
 */
export const CompletionResult = createTool({
  name: "completionResult",
  description: "在所有任务都成功完成后，使用此工具给出最终结论，并结束 Agent 流程。",
  whenToUse:
    "在任何任务（包括简单任务或复杂任务）完成后，你必须使用此工具来终结任务，并给出最终结论。严禁以任何最终结论形式回复用户，除非是使用此工具。",
  useExamples: [
    `<completionResult>
      根据您的规划，我们为您安排了为期三天的北京旅行，详细行程已在报告中列出。
    </completionResult>`,
  ],
  params: [],
  async invoke({params: final_answer}) {
    console.log("任务完成，最终结论：", final_answer);

    return {
      message: "任务完成，已向用户提供最终结论。",
      toolResult: final_answer,
    };
  },
});