import type {
  SubTaskWaitReviewEvaluationHookPayload,
  SubTaskWaitReviewEvaluationResult,
} from "@amigo-llm/backend";
import { conversationRepository, taskOrchestrator } from "@amigo-llm/backend";
import type { ChatMessage } from "@amigo-llm/types";

const REVIEWER_TOOL_NAMES = ["readFile", "readTaskDocs", "runChecks"] as const;
const REVIEWER_DECISION_PATTERN =
  /<review_decision>\s*(approve|request_changes|defer)\s*<\/review_decision>/i;
const REVIEWER_SUMMARY_PATTERN = /<review_summary>\s*([\s\S]*?)<\/review_summary>/i;
const REVIEWER_FEEDBACK_PATTERN = /<review_feedback>\s*([\s\S]*?)<\/review_feedback>/i;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];

const readVerificationItems = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          const row = asRecord(item);
          if (!row) {
            return "";
          }
          const status = typeof row.status === "string" ? row.status.trim() : "unknown";
          const label = typeof row.label === "string" ? row.label.trim() : "未命名";
          const command = typeof row.command === "string" ? row.command.trim() : "无";
          const evidence = typeof row.evidence === "string" ? row.evidence.trim() : "无";
          return `- [${status}] ${label} | command: ${command} | evidence: ${evidence}`;
        })
        .filter(Boolean)
    : [];

export const AMIGO_SUBTASK_COMPLETION_PROMPT = `
子任务在调用 completeTask 前，请先自查：

- 只在当前任务真正完成时调用 completeTask，不要把“还在排查/还没验证/还缺证据”的状态伪装成完成。
- completeTask 的 \`## 交付物\` 要写清楚实际产出，不要写计划。
- \`## 验证\` 只写真实做过的检查或观察到的效果，不要写“理论上可行”“应该没问题”。
- \`## 遗留问题\` 要如实写剩余风险；没有就明确写“无”。
- 如果是代码修改任务，提交 completeTask 前应优先自己运行必要检查，而不是把验证责任推给 reviewer。
`.trim();

const AMIGO_INDEPENDENT_REVIEWER_PROMPT = `
你是 Amigo 内部的独立 reviewer，职责是审查子任务的 completeTask 是否真的达成任务目标。

你当前运行在一个 main conversation 中：
- 你可以使用 readFile、readTaskDocs、runChecks 来检查真实产物。
- 你不能修改代码，也不能代替 builder 做实现。
- 这个 reviewer 会话没有 completeTask 工具，禁止调用 completeTask。
- 检查完成后，直接用一条普通 assistant message 输出最终裁决，不要再继续调用工具。
- 最终输出必须只包含下面要求的 XML 裁决块，不要在 XML 标签外再写解释文字。

你的工作方式：
- 先读 completeTask 里的 summary/result，理解子任务声称完成了什么。
- 再对照 taskDescription 判断这是否真的是该子任务应交付的内容。
- 如有必要，使用只读/检查型工具查看真实产物，例如 readFile、readTaskDocs、runChecks。
- 你只负责判断“通过”还是“打回修改”。

裁决标准：
- 只有在你确认交付物真实、验证可信、遗留问题可接受时，才能 approve。
- 只要发现实现与描述不符、验证不足、结果不完整、风险未说明，就返回 request_changes。
- 若信息明显不足或工具无法支撑可靠判断，可返回 defer；系统会把它视为需要继续修改，而不是交给主任务手动审批。

最终输出必须严格使用以下 XML 标签格式：
<review_decision>approve|request_changes|defer</review_decision>
<review_summary>一句话总结结论</review_summary>
<review_feedback>若需修改，写给 builder 的具体意见；否则写无</review_feedback>
`.trim();

const buildIndependentReviewerInput = ({
  subTaskId,
  taskDescription,
  pendingPayload,
}: {
  subTaskId: string;
  taskDescription?: string;
  pendingPayload: Record<string, unknown> | null;
}) => {
  const summary = typeof pendingPayload?.summary === "string" ? pendingPayload.summary.trim() : "";
  const result = typeof pendingPayload?.result === "string" ? pendingPayload.result.trim() : "";
  const changedFiles = readStringArray(pendingPayload?.changedFiles);
  const openRisks = readStringArray(pendingPayload?.openRisks);
  const verification = readVerificationItems(pendingPayload?.verification);

  return [
    "请审查以下子任务的 completeTask，并给出最终裁决。",
    `subTaskId: ${subTaskId}`,
    `taskDescription: ${taskDescription || "未提供"}`,
    "",
    "completeTask.summary:",
    summary || "无",
    "",
    "completeTask.result:",
    result || "无",
    ...(changedFiles.length > 0
      ? ["", "changedFiles:", ...changedFiles.map((filePath) => `- ${filePath}`)]
      : []),
    ...(verification.length > 0 ? ["", "verification:", ...verification] : []),
    ...(openRisks.length > 0 ? ["", "openRisks:", ...openRisks.map((risk) => `- ${risk}`)] : []),
    "",
    "请先判断子任务是否真的完成，再决定 approve 或 request_changes。",
  ].join("\n");
};

const getLastAssistantMessage = (messages: ChatMessage[]) =>
  [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" && !message.partial && typeof message.content === "string",
    )?.content || "";

const parseIndependentReviewerDecision = (content: string): SubTaskWaitReviewEvaluationResult => {
  const decisionMatch = REVIEWER_DECISION_PATTERN.exec(content);
  const summary = REVIEWER_SUMMARY_PATTERN.exec(content)?.[1]?.trim();
  const feedback = REVIEWER_FEEDBACK_PATTERN.exec(content)?.[1]?.trim();
  const decision = decisionMatch?.[1]?.toLowerCase();

  if (decision === "approve" || decision === "request_changes" || decision === "defer") {
    return {
      action: decision,
      message: summary || undefined,
      feedback: feedback && !/^无$/i.test(feedback) ? feedback : undefined,
    };
  }

  return {
    action: "defer",
    message: "独立 reviewer 未返回可解析的裁决。",
  };
};

export const evaluateAmigoSubTaskWaitReview = async ({
  subTaskId,
  pendingPayload,
  taskDescription,
  parentTaskId,
}: SubTaskWaitReviewEvaluationHookPayload): Promise<SubTaskWaitReviewEvaluationResult> => {
  const parentConversation = conversationRepository.load(parentTaskId);
  if (!parentConversation) {
    return {
      action: "defer",
      message: `未找到父任务 ${parentTaskId}。`,
    };
  }

  const reviewerConversation = conversationRepository.create({
    type: "main",
    parentId: parentTaskId,
    customPrompt: AMIGO_INDEPENDENT_REVIEWER_PROMPT,
    toolNames: [...REVIEWER_TOOL_NAMES],
    llm: parentConversation.llm,
    context: parentConversation.memory.context,
    modelConfigSnapshot: parentConversation.memory.modelConfigSnapshot,
    autoApproveToolNames: [...REVIEWER_TOOL_NAMES],
  });

  try {
    taskOrchestrator.setUserInput(
      reviewerConversation,
      buildIndependentReviewerInput({
        subTaskId,
        taskDescription,
        pendingPayload: asRecord(pendingPayload),
      }),
    );

    const executor = taskOrchestrator.getExecutor(reviewerConversation.id);
    await executor.execute(reviewerConversation);
    return parseIndependentReviewerDecision(
      getLastAssistantMessage(reviewerConversation.memory.messages),
    );
  } catch (error) {
    return {
      action: "defer",
      message: `独立 reviewer 执行失败：${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    taskOrchestrator.removeExecutor(reviewerConversation.id);
    await conversationRepository.deleteWithChildren(reviewerConversation.id);
  }
};

export { parseIndependentReviewerDecision };
