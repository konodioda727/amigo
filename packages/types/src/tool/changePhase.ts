import { z } from "zod";
import { WorkflowPhaseSchema } from "../workflow";

const OverridePhaseParamsSchema = z.object({
  targetPhase: WorkflowPhaseSchema.describe(
    "要手动重定位到的目标阶段，必须与当前阶段不同；若只是进入下一阶段，应使用 completeTask",
  ),
  reason: z.string().describe("切换到该阶段的原因"),
  evidence: z.string().optional().describe("支撑本次阶段切换的现有证据或上下文摘要"),
});

const OverridePhaseResultSchema = z.object({
  success: z.boolean().describe("是否切换成功"),
  fromPhase: WorkflowPhaseSchema.describe("切换前的阶段"),
  toPhase: WorkflowPhaseSchema.describe("切换后的阶段"),
  message: z.string().describe("阶段切换结果消息"),
});

export const OverridePhaseSchema = z.object({
  name: z.literal("overridePhase"),
  params: OverridePhaseParamsSchema,
  result: OverridePhaseResultSchema,
});

export const ChangePhaseSchema = z.object({
  name: z.literal("changePhase"),
  params: OverridePhaseParamsSchema,
  result: OverridePhaseResultSchema,
});

export type OverridePhaseParams = z.infer<typeof OverridePhaseSchema>["params"];
export type OverridePhaseResult = z.infer<typeof OverridePhaseSchema>["result"];
export type ChangePhaseParams = OverridePhaseParams;
export type ChangePhaseResult = OverridePhaseResult;
