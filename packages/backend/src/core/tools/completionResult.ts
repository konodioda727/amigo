import { logger } from "@/utils/logger";
import { createTool } from "./base";
import { createToolErrorResult, createToolResult } from "./result";

/**
 * 主任务本轮收尾工具
 * 用于显式结束主任务当前这一轮，并把最终用户可见结果结构化返回给前端。
 */
export const CompletionResult = createTool({
  name: "completionResult",
  description:
    "✅ 【主任务专用】显式结束当前这一轮，并返回面向用户的结果总结。主任务在完成本轮交付、同步后台状态或给出最终答复时，都应使用它收尾。",
  whenToUse:
    "仅在主任务需要结束当前这一轮时调用：例如任务已完成、已给出最终答复、后台任务已启动并已向用户说明当前状态，或当前轮需要用结构化总结收尾。summary/result 应优先说明本轮新增变化与当前状态；只有在用户理解当前状态确实需要时，才补充较早的背景。不要在子任务中使用。",
  params: [
    {
      name: "summary",
      optional: false,
      description: "本轮结果摘要，优先说明新完成的动作、目标完成情况和当前状态（1-2句话）",
    },
    {
      name: "result",
      optional: false,
      description:
        "本轮结果说明，使用 Markdown 输出，优先覆盖新完成改动、目标完成情况、当前状态以及剩余事项/后续安排（如有）；不要机械重复未变化的背景",
    },
  ],
  async invoke({ params, context }) {
    if (context.parentId) {
      logger.error("[completionResult] 此工具只能在主任务中使用");
      return createToolErrorResult(
        "错误：completionResult 工具只能在主任务中使用",
        "错误：completionResult 工具只能在主任务中使用",
        {
          transportMessage: "错误：completionResult 工具只能在主任务中使用",
        },
      );
    }

    return createToolResult(params.result, {
      transportMessage: params.result,
      continuationSummary: params.summary,
      checkpointResult: params.result,
    });
  },
});
