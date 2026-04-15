import {
  CONTROLLER_DEFAULT_WORKFLOW_PHASE_SEQUENCE,
  canTransitionWorkflowPhase,
  normalizeWorkflowPhaseSequence,
} from "@amigo-llm/types";
import { conversationRepository } from "../conversation/ConversationRepository";
import { createTool } from "./base";
import { createToolResult } from "./result";

export const OverridePhase = createTool({
  name: "overridePhase",
  description: "仅在 workflow 阶段判断明显不适合时，手动将主任务重定位到更合适的阶段。",
  whenToUse:
    "只在用户纠正前序判断、任务范围变化、或已有证据表明必须跳到其他阶段时使用。若只是当前阶段完成、要正常进入下一阶段，必须调用 completeTask，不要使用本工具。",
  params: [
    {
      name: "targetPhase",
      optional: false,
      description: "要手动重定位到的目标阶段。若只是进入下一阶段，不要使用本工具。",
    },
    {
      name: "reason",
      optional: false,
      description: "切换原因，说明为何当前证据已足以进入目标阶段。",
    },
    {
      name: "evidence",
      optional: true,
      description: "可选：支撑本次切换的事实摘要、文档、用户补充说明或验证信息。",
    },
  ],
  async invoke({ params, context }) {
    const conversation = conversationRepository.load(context.taskId);
    if (!conversation) {
      return createToolResult(
        {
          success: false,
          fromPhase: "requirements",
          toPhase: params.targetPhase,
          message: `未找到任务 ${context.taskId}`,
        },
        {
          transportMessage: `overridePhase 失败：未找到任务 ${context.taskId}`,
        },
      );
    }

    if (conversation.workflowAgentRole !== "controller") {
      const message = `overridePhase 仅允许主任务 controller 使用，当前角色=${conversation.workflowAgentRole}`;
      return createToolResult(
        {
          success: false,
          fromPhase: conversation.currentWorkflowPhase,
          toPhase: params.targetPhase,
          message,
        },
        {
          transportMessage: message,
        },
      );
    }

    const switchingFastModeIntoPhasedDesign =
      conversation.workflowState.mode === "fast" && params.targetPhase !== "complete";
    const phaseSequence = normalizeWorkflowPhaseSequence(
      switchingFastModeIntoPhasedDesign
        ? CONTROLLER_DEFAULT_WORKFLOW_PHASE_SEQUENCE
        : conversation.workflowState.phaseSequence,
      CONTROLLER_DEFAULT_WORKFLOW_PHASE_SEQUENCE,
    );
    const fromPhase = conversation.currentWorkflowPhase;
    const fromIndex = phaseSequence.indexOf(fromPhase);
    const targetIndex = phaseSequence.indexOf(params.targetPhase);

    if (
      !canTransitionWorkflowPhase(
        fromPhase,
        params.targetPhase,
        CONTROLLER_DEFAULT_WORKFLOW_PHASE_SEQUENCE,
      )
    ) {
      const message = `非法阶段切换：${fromPhase} -> ${params.targetPhase}`;
      return createToolResult(
        {
          success: false,
          fromPhase,
          toPhase: params.targetPhase,
          message,
        },
        {
          transportMessage: message,
        },
      );
    }

    if (targetIndex === fromIndex + 1) {
      const message = `overridePhase 不用于正常进入下一阶段，当前阶段=${fromPhase}，目标阶段=${params.targetPhase}。如果你判断当前阶段已经完成，请调用 completeTask。`;
      return createToolResult(
        {
          success: false,
          fromPhase,
          toPhase: params.targetPhase,
          message,
        },
        {
          transportMessage: message,
          error: message,
        },
      );
    }

    conversation.changeWorkflowPhase(
      params.targetPhase,
      {
        reason: params.reason,
        evidence: typeof params.evidence === "string" ? params.evidence : undefined,
      },
      switchingFastModeIntoPhasedDesign ? { mode: "phased" } : undefined,
    );

    const movingBackward = targetIndex < fromIndex;
    const skippedCount = movingBackward ? 0 : Math.max(targetIndex - fromIndex - 1, 0);
    const message = movingBackward
      ? `workflow 已从 ${fromPhase} 回退到 ${params.targetPhase}，后续阶段状态已重置${switchingFastModeIntoPhasedDesign ? "，并已切回 phased workflow" : ""}`
      : skippedCount > 0
        ? `workflow 已从 ${fromPhase} 跳转到 ${params.targetPhase}，中间阶段已标记为 skipped${switchingFastModeIntoPhasedDesign ? "，并已切回 phased workflow" : ""}`
        : `workflow 已从 ${fromPhase} 切换到 ${params.targetPhase}${switchingFastModeIntoPhasedDesign ? "，并已切回 phased workflow" : ""}`;
    const continuationSummary = movingBackward
      ? `【已回退到 ${params.targetPhase}】`
      : skippedCount > 0
        ? `【已跳转到 ${params.targetPhase}】`
        : `【已切换到 ${params.targetPhase}】`;
    return createToolResult(
      {
        success: true,
        fromPhase,
        toPhase: params.targetPhase,
        message,
      },
      {
        transportMessage: message,
        continuationSummary,
        continuationResult: {
          fromPhase,
          toPhase: params.targetPhase,
          reason: params.reason,
          ...(switchingFastModeIntoPhasedDesign ? { mode: "phased" } : {}),
        },
      },
    );
  },
});
