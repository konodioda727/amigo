import pWaitFor from "p-wait-for";
import { logger } from "@/utils/logger";
import { CompletionHandler } from "./CompletionHandler";
import type { Conversation } from "./Conversation";
import { StreamHandler } from "./StreamHandler";
import { ToolExecutor } from "./ToolExecutor";

/**
 * 会话执行器 - 协调 LLM 交互、工具执行和完成处理
 * 无状态服务，所有状态都在 Conversation 中
 */
export class ConversationExecutor {
  private currentAbortController: AbortController | null = null;
  private toolExecutor = new ToolExecutor();
  private streamHandler = new StreamHandler(this.toolExecutor);
  private completionHandler = new CompletionHandler();

  /**
   * 执行会话
   */
  async execute(conversation: Conversation): Promise<void> {
    // 检查是否有待确认的工具调用
    if (conversation.status === "waiting_tool_confirmation" && conversation.pendingToolCall) {
      await this.handlePendingToolConfirmation(conversation);
      return;
    }

    // 等待用户输入
    await pWaitFor(() => !!conversation.userInput);
    conversation.status = "streaming";
    await this.executeLoop(conversation);
  }

  /**
   * 获取当前的 AbortController
   */
  getCurrentAbortController(): AbortController | null {
    return this.currentAbortController;
  }

  /**
   * 清除 AbortController
   */
  clearAbortController(): void {
    this.currentAbortController = null;
  }

  /**
   * 处理待确认的工具调用
   */
  private async handlePendingToolConfirmation(conversation: Conversation): Promise<void> {
    const pending = conversation.pendingToolCall;
    if (!pending) {
      return;
    }

    // 等待用户输入（此时应该已经有输入了，因为是 MessageResolver 触发的）
    await pWaitFor(() => !!conversation.userInput);
    const input = conversation.userInput;

    if (input === "confirm") {
      logger.info(`[ConversationExecutor] 用户确认执行工具 ${pending.toolName}`);
      conversation.status = "tool_executing";
      conversation.pendingToolCall = null;
      conversation.userInput = ""; // 清除确认指令

      const controller = new AbortController();
      this.currentAbortController = controller;

      await this.toolExecutor.executeToolCall(
        conversation,
        pending.fullToolCall,
        pending.toolName,
        pending.type,
        controller.signal,
      );

      // 继续执行循环
      const shouldContinue = await this.completionHandler.handleStreamCompletion(
        conversation,
        pending.toolName,
        this.toolExecutor.getLastToolHadError(),
        this.toolExecutor.getLastToolError(),
      );

      if (shouldContinue && !conversation.isAborted) {
        logger.info(`[ConversationExecutor] 工具执行完毕，继续执行 loop`);
        return this.executeLoop(conversation);
      } else {
        logger.info(`[ConversationExecutor] 工具执行完毕，停止 loop`);
        return;
      }
    } else {
      // reject 或 commonMessage，都视为拒绝/取消
      logger.info(`[ConversationExecutor] 用户拒绝/取消工具 ${pending.toolName}，输入: ${input}`);
      conversation.pendingToolCall = null;

      // MessageResolver 已经将其 added to memory。
      // 所以这里清除 userInput 是安全的，防止下次 execute 误判。
      conversation.userInput = "";

      // 添加系统消息说明工具被取消
      conversation.memory.addMessage({
        role: "system",
        content: `用户取消了工具 '${pending.toolName}' 的执行。`,
        type: "system",
        partial: false,
      });

      return this.executeLoop(conversation);
    }
  }

  /**
   * 执行主循环
   */
  private async executeLoop(conversation: Conversation): Promise<void> {
    if (conversation.isAborted) {
      logger.info("检测到中断状态，停止执行循环");
      return;
    }

    const controller = new AbortController();
    this.currentAbortController = controller;

    try {
      const currentTool = await this.streamHandler.handleStream(conversation, controller);

      const shouldContinue = await this.completionHandler.handleStreamCompletion(
        conversation,
        currentTool,
        this.toolExecutor.getLastToolHadError(),
        this.toolExecutor.getLastToolError(),
      );

      logger.info(
        `[ConversationExecutor] handleStreamCompletion 返回: ${shouldContinue}, currentTool: ${currentTool}, hadError: ${this.toolExecutor.getLastToolHadError()}, isAborted: ${conversation.isAborted}`,
      );

      if (shouldContinue && !conversation.isAborted) {
        logger.info(`[ConversationExecutor] 继续执行循环`);
        return this.executeLoop(conversation);
      } else {
        logger.info(`[ConversationExecutor] 停止执行循环`);
      }
    } catch (error: unknown) {
      this.currentAbortController = null;

      const err = error as Error & { name?: string };
      if (err.name === "AbortError" || conversation.isAborted || err.message === "interrupt") {
        logger.info("执行循环被中断");
        // 中断后不再继续循环，等待用户通过 resume 重新启动
        return;
      }

      // 其他错误，重置错误计数并继续循环
      this.streamHandler.resetErrorCount();
      return this.executeLoop(conversation);
    } finally {
      if (this.currentAbortController) {
        this.currentAbortController = null;
      }
    }
  }
}
