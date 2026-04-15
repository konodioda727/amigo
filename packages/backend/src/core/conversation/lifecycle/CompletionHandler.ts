import type { ChatMessage } from "@amigo-llm/types";
import { logger } from "@/utils/logger";
import { buildControllerNoToolRetryMessage } from "../../workflow";
import type { Conversation } from "../Conversation";
import { flushConversationContinuationsIfIdle } from "../context/asyncContinuations";
import { loopDetectorManager } from "../context/LoopDetectorManager";
import { broadcaster } from "./WebSocketBroadcaster";

interface ToolError {
  toolName: string;
  error: string;
  type: ChatMessage["type"];
}

export interface CompletionDecision {
  shouldContinue: boolean;
  nextTurnMessages?: ChatMessage[];
}

const continueDecision = (nextTurnMessages?: ChatMessage[]): CompletionDecision => ({
  shouldContinue: true,
  ...(nextTurnMessages && nextTurnMessages.length > 0 ? { nextTurnMessages } : {}),
});

const stopDecision = (): CompletionDecision => ({
  shouldContinue: false,
});

/**
 * 完成处理器 - 负责处理流完成后的各种逻辑
 */
export class CompletionHandler {
  private getAvailableToolNames(conversation: Conversation): string[] {
    if (typeof conversation.toolService?.getAllToolsForWorkflow !== "function") {
      return [];
    }

    return conversation.toolService
      .getAllToolsForWorkflow({
        currentPhase: conversation.currentWorkflowPhase,
        agentRole: conversation.workflowAgentRole,
        workflowMode: conversation.workflowState.mode,
      })
      .map((tool) => tool.name);
  }

  private buildControllerRetryContent(
    conversation: Conversation,
    allowedToolNames: string[],
  ): string {
    return buildControllerNoToolRetryMessage({
      phase: conversation.currentWorkflowPhase,
      allowedToolNames,
      workflowMode: conversation.workflowState?.mode,
      phaseSequence: conversation.workflowState?.phaseSequence,
    });
  }

  private buildNoToolRetryMessages(conversation: Conversation): ChatMessage[] {
    const allowedToolNames = this.getAvailableToolNames(conversation);
    const allowedToolsLine =
      allowedToolNames.length > 0 ? allowedToolNames.join(", ") : "无显式可用工具";

    if (conversation.workflowAgentRole === "execution_worker") {
      return [
        {
          role: "user",
          type: "message",
          partial: false,
          content: `上一条回复没有调用任何工具。

你是 execution_worker。下一条回复必须立刻调用工具：
1. 实现、检查都已完成，且可以提交执行结果：调用 completeTask
2. 仍需继续实现、读取代码或执行检查：调用当前允许的执行类工具

不要再输出普通文本。
当前允许工具: ${allowedToolsLine}`,
        },
      ];
    }

    return [
      {
        role: "user",
        type: "message",
        partial: false,
        content: this.buildControllerRetryContent(conversation, allowedToolNames),
      },
    ];
  }

  private buildToolErrorRecoveryContent(conversation: Conversation, toolError: ToolError): string {
    const { toolName, error } = toolError;
    const lines = [
      `❌ 工具调用失败：${toolName}`,
      "",
      `错误原因：${error}`,
      "",
      "这说明上一次工具调用本身有问题，不代表应该立刻改走另一条工具路径。",
      "下一条回复应优先修正并重试同一个工具；只有当错误已经明确说明该工具在当前场景不适用时，才切换到别的工具方案。",
      "请仔细阅读工具定义并重试，确保：",
      "1. 工具名称与注册定义完全一致",
      "2. 参数为结构化对象（JSON object）",
      "3. 提供所有必需参数，参数类型正确",
      "4. 如果只是参数缺失、类型错误、格式错误或前置条件未满足，直接补齐后重试同一个工具",
    ];

    if (conversation.currentWorkflowPhase === "execution") {
      lines.push("5. 不要因为这次失败退回大量读取或改走别的实现路径；先把同一个工具调用修正到成功");
    } else {
      lines.push("5. 不要因为这次失败立刻改走另一种工具路径；先把同一个工具调用修正到成功");
    }

    return lines.join("\n");
  }

  /**
   * 处理流完成后的逻辑
   * @returns true 表示应该继续循环，false 表示停止
   */
  async handleStreamCompletion(
    conversation: Conversation,
    currentTool: string,
    hadError: boolean,
    lastToolError: ToolError | null,
  ): Promise<CompletionDecision> {
    if (conversation.isAborted || conversation.status === "aborted") {
      logger.info("[CompletionHandler] 会话已中断，跳过完成阶段处理");
      return stopDecision();
    }

    if (conversation.status === "waiting_tool_confirmation") {
      logger.info("[CompletionHandler] Waiting for tool confirmation, stopping stream loop.");
      return stopDecision();
    }

    logger.info(
      `[CompletionHandler] handleStreamCompletion called with currentTool: ${currentTool}, hadError: ${hadError}`,
    );

    // 如果工具执行出错，添加错误信息到 memory 并继续 loop 让 AI 重试
    if (hadError && lastToolError) {
      return this.handleToolError(conversation, lastToolError);
    }

    const completionBehavior =
      conversation.toolService.getToolFromName(currentTool)?.completionBehavior;

    // 根据不同的工具类型处理完成逻辑
    switch (currentTool) {
      case "completeTask":
        return this.handleCompleteTask(conversation);

      case "message":
        return this.handleMessage(conversation);

      default:
        if (completionBehavior === "idle") {
          return this.handleIdleTool(conversation, currentTool);
        }
        return this.handleDefault(conversation, currentTool);
    }
  }

  /**
   * 处理工具执行错误
   */
  private handleToolError(conversation: Conversation, toolError: ToolError): CompletionDecision {
    if (conversation.isAborted || conversation.status === "aborted") {
      logger.info("[CompletionHandler] 会话已中断，忽略工具错误恢复流程");
      return stopDecision();
    }

    const { type } = toolError;
    logger.info(`[CompletionHandler] 工具执行出错，添加错误信息到 memory`);

    conversation.memory.addMessage({
      role: "user",
      content: this.buildToolErrorRecoveryContent(conversation, toolError),
      type,
      partial: false,
    });

    conversation.status = "streaming";
    return continueDecision();
  }

  /**
   * 处理 completeTask 工具
   */
  private handleCompleteTask(conversation: Conversation): CompletionDecision {
    const disposition = conversation.consumeLastCompleteTaskDisposition();
    if (disposition === "phase_advanced") {
      logger.info(`[CompletionHandler] 会话 ${conversation.id} 已完成当前阶段，继续进入下一阶段`);
      conversation.setWorkflowState(conversation.workflowState, {
        announce: true,
        forceAnnouncement: true,
      });
      conversation.status = "streaming";
      return continueDecision();
    }

    logger.info("\n任务已完成（completeTask）。");
    conversation.status = "completed";

    // 广播 conversationOver
    broadcaster.broadcastConversation(conversation, {
      type: "conversationOver",
      data: {
        reason: "completeTask",
      },
    });

    logger.info(`[CompletionHandler] 会话 ${conversation.id} 已通过 completeTask 完成`);
    conversation.userInput = "";
    return stopDecision();
  }

  /**
   * 处理执行后需要等待用户输入的工具
   */
  private handleIdleTool(conversation: Conversation, currentTool: string): CompletionDecision {
    conversation.userInput = "";
    conversation.status = "idle";
    broadcaster.broadcastConversation(conversation, {
      type: "conversationOver",
      data: {
        reason: currentTool === "askFollowupQuestion" ? "askFollowupQuestion" : "tool",
      },
    });
    void flushConversationContinuationsIfIdle(conversation);
    return stopDecision();
  }

  /**
   * 处理普通消息
   */
  private handleMessage(conversation: Conversation): CompletionDecision {
    const actorLabel =
      conversation.workflowAgentRole === "controller"
        ? "主任务"
        : conversation.workflowAgentRole === "verification_reviewer"
          ? "reviewer"
          : "执行子任务";
    logger.warn(`\n⚠️  ${actorLabel}未使用任何工具，注入下一轮重试提示`);
    conversation.status = "streaming";
    return continueDecision(this.buildNoToolRetryMessages(conversation));
  }

  /**
   * 处理默认情况
   */
  private handleDefault(conversation: Conversation, currentTool: string): CompletionDecision {
    logger.info(
      `[CompletionHandler] default 分支: 工具 ${currentTool} 执行后继续循环，设置 status 为 streaming`,
    );
    conversation.status = "streaming";
    return continueDecision(loopDetectorManager.buildRetryMessages(conversation));
  }
}
