import { z } from "zod";
import { WorkflowAgentRoleSchema, WorkflowPhaseSchema } from "../workflow";

export const FinishPhaseSchema = z.object({
  name: z.literal("finishPhase"),
  params: z
    .object({
      summary: z
        .string()
        .describe(
          "当前阶段收口摘要。controller 用于简短总结当前阶段结论；在 requirements 阶段应清楚概括整理后的用户需求和范围；execution worker 用于父任务自动验收与通知。",
        ),
      result: z
        .string()
        .describe(
          "当前阶段的详细结果。controller：在 requirements 阶段必须把澄清后的用户需求、目标、约束和范围写清楚，作为后续阶段输入；在 design 阶段必须包含 `## 已确认事实`、`## 关键约束`、`## 实施计划` 三个二级标题，只有当仍有阻塞 execution 的事项时才额外填写 `## 未决问题`；在 verification 阶段必须写清真实检查记录和最终判定。execution worker：必须包含 `## 交付物`、`## 验证`、`## 遗留问题`、`## 下游说明` 四个二级标题。",
        ),
      nextPhase: WorkflowPhaseSchema.optional().describe(
        "controller 主任务在非 complete 阶段必填，表示下一步进入哪个阶段。推荐路径：简单问询走 requirements -> complete；检索任务走 requirements -> design -> verification -> complete；需要执行的任务走 requirements -> design -> execution -> verification -> complete。execution worker 不需要填写。",
      ),
      achievements: z
        .string()
        .optional()
        .describe("可选：达到的效果或关键成果（如：创建了3个文件、修复了2个bug等）"),
      usage: z
        .string()
        .optional()
        .describe("可选：如何使用结果的说明（如：运行命令、访问URL、查看文件等）"),
    })
    .describe("阶段收口参数"),
  result: z.string().describe("阶段已收口，并已根据 nextPhase 推进主任务或更新父任务待办列表"),
});

export const FinishPhaseWebsocketDataSchema = z.object({
  kind: z.enum(["phase_complete", "task_complete"]),
  completedPhase: WorkflowPhaseSchema.optional(),
  currentPhase: WorkflowPhaseSchema.optional(),
  agentRole: WorkflowAgentRoleSchema.optional(),
});

export type FinishPhaseWebsocketData = z.infer<typeof FinishPhaseWebsocketDataSchema>;
