import type { SubmitTaskReviewResult } from "@amigo-llm/types";
import { createTool } from "./base";
import { createToolResult } from "./result";

export const SubmitTaskReview = createTool({
  name: "submitTaskReview",
  description: "提交 verification reviewer 对执行子任务的最终审查结果。",
  whenToUse:
    "仅供 verification_reviewer 使用。在完成检查后，用它结构化提交 approve 或 request_changes，不要用普通文本输出裁决。",
  completionBehavior: "idle",
  params: [
    {
      name: "decision",
      optional: false,
      description: "审查裁决，只能是 approve 或 request_changes",
    },
    {
      name: "summary",
      optional: false,
      description: "一句话总结审查结论",
    },
    {
      name: "feedback",
      optional: true,
      description: "若打回修改，写给 builder 的具体意见；批准时可省略",
    },
  ],
  async invoke({ params }) {
    const decision = typeof params.decision === "string" ? params.decision.trim() : "";
    if (decision !== "approve" && decision !== "request_changes") {
      const message = "submitTaskReview.decision 只能是 approve 或 request_changes";
      return createToolResult(
        {
          success: false,
          decision: "request_changes",
          summary: "",
          message,
        } satisfies SubmitTaskReviewResult,
        {
          transportMessage: message,
          continuationSummary: message,
        },
      );
    }

    const summary = typeof params.summary === "string" ? params.summary.trim() : "";
    if (!summary) {
      const message = "submitTaskReview.summary 不能为空";
      return createToolResult(
        {
          success: false,
          decision: "request_changes",
          summary: "",
          message,
        } satisfies SubmitTaskReviewResult,
        {
          transportMessage: message,
          continuationSummary: message,
        },
      );
    }

    const feedback =
      typeof params.feedback === "string" && params.feedback.trim()
        ? params.feedback.trim()
        : undefined;
    const message =
      decision === "approve" ? `已提交审查通过：${summary}` : `已提交审查打回：${summary}`;

    return createToolResult(
      {
        success: true,
        decision,
        summary,
        ...(feedback ? { feedback } : {}),
        message,
      } satisfies SubmitTaskReviewResult,
      {
        transportMessage: message,
        continuationSummary: `【已提交审查结果：${decision}】`,
        continuationResult: {
          success: true,
          decision,
          summary,
          ...(feedback ? { feedback } : {}),
          message,
        } satisfies SubmitTaskReviewResult,
      },
    );
  },
});
