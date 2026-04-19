import type {
  TaskExecutionVerificationHookPayload,
  TaskExecutionVerificationResult,
} from "@amigo-llm/backend";

export const AMIGO_EXECUTION_WORKER_COMPLETION_PROMPT = `
执行子会话在调用 finishPhase 前，请先自查：

- 只在当前任务真正完成时调用 finishPhase，不要把“还在排查/还没验证/还缺证据”的状态伪装成完成。
- finishPhase 的 \`## 交付物\` 要写清楚实际产出，不要写计划。
- \`## 验证\` 只写真实做过的检查或观察到的效果，不要写“理论上可行”“应该没问题”。
- 如果是代码修改任务，\`## 验证\` 必须先写 LSP/diagnostics 是否已确认 clean，再写对应的 build、lint 或其他工程级检查结果。
- 最后还要写真实链路上的集成测试已经实际运行；不要只写孤立模块测试、纯单元测试或与主链路脱节的 mock 测试。
- 如果现有测试不足以证明修改真的接入目标链路，要先补最小必要的集成测试，再提交 finishPhase。
- \`## 遗留问题\` 要如实写剩余风险；没有就明确写“无”。
- 如果是代码修改任务，提交 finishPhase 前应优先自己运行必要检查，而不是把验证责任推给 reviewer。
`.trim();

export const evaluateAmigoTaskExecutionVerification = async ({
  executionTaskId,
}: TaskExecutionVerificationHookPayload): Promise<TaskExecutionVerificationResult> => {
  return {
    action: "defer",
    message: `执行任务 ${executionTaskId} 不再触发独立 reviewer，直接使用子任务自检结果。`,
  };
};
