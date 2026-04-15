import type {
  TaskExecutionVerificationHookPayload,
  TaskExecutionVerificationResult,
} from "@amigo-llm/backend";

export const AMIGO_EXECUTION_WORKER_COMPLETION_PROMPT = `
执行子会话在调用 completeTask 前，请先自查：

- 只在当前任务真正完成时调用 completeTask，不要把“还在排查/还没验证/还缺证据”的状态伪装成完成。
- completeTask 的 \`## 交付物\` 要写清楚实际产出，不要写计划。
- \`## 验证\` 只写真实做过的检查或观察到的效果，不要写“理论上可行”“应该没问题”。
- \`## 遗留问题\` 要如实写剩余风险；没有就明确写“无”。
- 如果是代码修改任务，提交 completeTask 前应优先自己运行必要检查，而不是把验证责任推给 reviewer。
`.trim();

export const evaluateAmigoTaskExecutionVerification = async ({
  executionTaskId,
}: TaskExecutionVerificationHookPayload): Promise<TaskExecutionVerificationResult> => {
  return {
    action: "defer",
    message: `执行任务 ${executionTaskId} 不再触发独立 reviewer，直接使用子任务自检结果。`,
  };
};
