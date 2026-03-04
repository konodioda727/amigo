import type { ChatMessage } from "@amigo-llm/types";
import { logger } from "@/utils/logger";
import type { Conversation } from "./Conversation";
import { broadcaster } from "./WebSocketBroadcaster";

interface ToolError {
  toolName: string;
  error: string;
  type: ChatMessage["type"];
}

/**
 * 完成处理器 - 负责处理流完成后的各种逻辑
 */
export class CompletionHandler {
  /**
   * 处理流完成后的逻辑
   * @returns true 表示应该继续循环，false 表示停止
   */
  async handleStreamCompletion(
    conversation: Conversation,
    currentTool: string,
    hadError: boolean,
    lastToolError: ToolError | null,
  ): Promise<boolean> {
    if (conversation.isAborted || conversation.status === "aborted") {
      logger.info("[CompletionHandler] 会话已中断，跳过完成阶段处理");
      return false;
    }

    if (conversation.status === "waiting_tool_confirmation") {
      logger.info("[CompletionHandler] Waiting for tool confirmation, stopping stream loop.");
      return false;
    }

    logger.info(
      `[CompletionHandler] handleStreamCompletion called with currentTool: ${currentTool}, hadError: ${hadError}`,
    );

    // 如果工具执行出错，添加错误信息到 memory 并继续 loop 让 AI 重试
    if (hadError && lastToolError) {
      return this.handleToolError(conversation, lastToolError);
    }

    // 根据不同的工具类型处理完成逻辑
    switch (currentTool) {
      case "completeTask":
        return this.handleCompleteTask(conversation);

      case "askFollowupQuestion":
        return this.handleAskFollowupQuestion(conversation);

      case "message":
        return this.handleMessage(conversation);

      default:
        return this.handleDefault(conversation, currentTool);
    }
  }

  /**
   * 处理工具执行错误
   */
  private handleToolError(conversation: Conversation, toolError: ToolError): boolean {
    if (conversation.isAborted || conversation.status === "aborted") {
      logger.info("[CompletionHandler] 会话已中断，忽略工具错误恢复流程");
      return false;
    }

    const { toolName, error, type } = toolError;
    logger.info(`[CompletionHandler] 工具执行出错，添加错误信息到 memory`);

    conversation.memory.addMessage({
      role: "system",
      content:
        `❌ 工具调用失败：${toolName}\n\n错误原因：${error}\n\n` +
        "请仔细阅读工具定义并重试，确保：\n" +
        "1. 工具名称与注册定义完全一致\n" +
        "2. 参数为结构化对象（JSON object）\n" +
        "3. 提供所有必需参数，参数类型正确\n",
      type,
      partial: false,
    });

    conversation.status = "streaming";
    return true;
  }

  /**
   * 处理 completeTask 工具
   */
  private handleCompleteTask(conversation: Conversation): boolean {
    logger.info("\n子任务已完成（completeTask）。");
    conversation.status = "completed";

    // 广播 conversationOver
    broadcaster.broadcast(conversation.id, {
      type: "conversationOver",
      data: {
        reason: "completeTask",
      },
    });

    logger.info(`[CompletionHandler] 子任务 ${conversation.id} 已通过 completeTask 完成`);
    conversation.userInput = "";
    return false;
  }

  /**
   * 处理 askFollowupQuestion 工具
   */
  private handleAskFollowupQuestion(conversation: Conversation): boolean {
    conversation.userInput = "";
    conversation.status = "idle";
    broadcaster.broadcast(conversation.id, {
      type: "conversationOver",
      data: {
        reason: "askFollowupQuestion",
      },
    });
    return false;
  }

  /**
   * 处理普通消息
   */
  private handleMessage(conversation: Conversation): boolean {
    if (conversation.type !== "main") {
      logger.warn("\n⚠️  子任务未使用任何工具，添加惩罚提示");
      conversation.memory.addMessage({
        role: "system",
        content: `警告：你是一个子任务代理，必须使用工具来完成任务。

请注意：
1. 如果任务已完成，必须调用 completeTask
2. 如果需要更多信息，必须调用 askFollowupQuestion
3. 如果需要执行操作，必须调用相应工具（如 browserSearch、bash 等）
4. 不要只输出普通文本消息

请立即调用正确的工具。`,
        type: "message",
        partial: false,
      });
      conversation.status = "streaming";
      return true;
    }

    // 主任务允许普通对话，等待用户回复
    logger.info("\n主任务进行普通对话，等待用户回复");
    conversation.userInput = "";
    broadcaster.broadcast(conversation.id, {
      type: "conversationOver",
      data: {
        reason: "message",
      },
    });
    conversation.status = "idle";
    // 不返回 true，而是返回 false 停止循环
    // 下一次用户输入时会通过 commonMessageResolver 重新调用 execute
    return false;
  }

  /**
   * 处理默认情况
   */
  private handleDefault(conversation: Conversation, currentTool: string): boolean {
    logger.info(
      `[CompletionHandler] default 分支: 工具 ${currentTool} 执行后继续循环，设置 status 为 streaming`,
    );
    conversation.status = "streaming";
    return true;
  }
}
