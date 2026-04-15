import type { ChatMessage } from "@amigo-llm/types";
import pWaitFor from "p-wait-for";
import { logger } from "@/utils/logger";
import type { Conversation } from "../Conversation";
import { flushConversationContinuationsBeforeNextTurn } from "../context/asyncContinuations";
import { type CompletionDecision, CompletionHandler } from "./CompletionHandler";
import { StreamHandler } from "./StreamHandler";
import { ToolExecutor } from "./ToolExecutor";

/**
 * 会话执行器 - 协调 LLM 交互、工具执行和完成处理
 * 无状态服务，所有状态都在 Conversation 中
 */
export class ConversationExecutor {
  private currentAbortController: AbortController | null = null;
  private readonly toolExecutor: ToolExecutor;
  private readonly streamHandler: StreamHandler;
  private readonly completionHandler: CompletionHandler;

  constructor() {
    this.toolExecutor = new ToolExecutor();
    this.streamHandler = new StreamHandler(this.toolExecutor);
    this.completionHandler = new CompletionHandler();
  }

  private normalizeCompletionDecision(result: boolean | CompletionDecision): CompletionDecision {
    if (typeof result === "boolean") {
      return { shouldContinue: result };
    }
    return result;
  }

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
    await pWaitFor(() => !!conversation.userInput || conversation.isAborted);
    if (conversation.isAborted) {
      logger.info("[ConversationExecutor] execute 检测到会话已中断，跳过执行");
      return;
    }
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

  private toToolCallArguments(params: unknown): Record<string, unknown> {
    return params && typeof params === "object" && !Array.isArray(params)
      ? (params as Record<string, unknown>)
      : {};
  }

  private startDetachedToolExecution(
    conversation: Conversation,
    toolCalls: Parameters<StreamHandler["processToolCalls"]>[1],
    logs: {
      onAbortedAfterTool: string;
      onContinue: string;
      onStop: string;
    },
  ): void {
    if (conversation.isAborted || toolCalls.length === 0) {
      logger.info("[ConversationExecutor] 会话已中断或无可执行工具，跳过 detached tool runner");
      return;
    }

    conversation.status = "tool_executing";
    conversation.userInput = "";

    const controller = new AbortController();
    this.currentAbortController = controller;

    void this.runDetachedToolExecution(conversation, toolCalls, controller, logs);
  }

  private startDetachedConfirmedToolExecution(
    conversation: Conversation,
    pending: NonNullable<Conversation["pendingToolCall"]>,
    logs: {
      onAbortedAfterTool: string;
      onContinue: string;
      onStop: string;
    },
  ): void {
    if (conversation.isAborted) {
      logger.info("[ConversationExecutor] 会话已中断，跳过已确认工具的 detached 执行");
      return;
    }

    conversation.status = "tool_executing";
    conversation.pendingToolCall = null;
    conversation.userInput = "";

    const controller = new AbortController();
    this.currentAbortController = controller;

    void this.runDetachedConfirmedToolExecution(conversation, pending, controller, logs);
  }

  private async runDetachedToolExecution(
    conversation: Conversation,
    toolCalls: Parameters<StreamHandler["processToolCalls"]>[1],
    controller: AbortController,
    logs: {
      onAbortedAfterTool: string;
      onContinue: string;
      onStop: string;
    },
  ): Promise<void> {
    try {
      const currentTool = await this.streamHandler.processToolCalls(
        conversation,
        toolCalls,
        controller.signal,
      );

      if (
        conversation.isAborted ||
        controller.signal.aborted ||
        conversation.pendingToolCall ||
        conversation.status === "waiting_tool_confirmation"
      ) {
        logger.info(
          conversation.isAborted || controller.signal.aborted
            ? logs.onAbortedAfterTool
            : logs.onStop,
        );
        return;
      }

      const completion = this.normalizeCompletionDecision(
        await this.completionHandler.handleStreamCompletion(
          conversation,
          currentTool,
          this.toolExecutor.getLastToolHadError(),
          this.toolExecutor.getLastToolError(),
        ),
      );

      if (completion.shouldContinue && !conversation.isAborted) {
        logger.info(logs.onContinue);
        await this.executeLoop(conversation, completion.nextTurnMessages || []);
        return;
      }

      logger.info(logs.onStop);
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      if (
        err.name === "AbortError" ||
        conversation.isAborted ||
        controller.signal.aborted ||
        err.message === "interrupt"
      ) {
        logger.info(logs.onAbortedAfterTool);
        return;
      }

      this.streamHandler.resetErrorCount();
      conversation.status = "streaming";
      await this.executeLoop(conversation);
    } finally {
      if (this.currentAbortController === controller) {
        this.currentAbortController = null;
      }
    }
  }

  private async runDetachedConfirmedToolExecution(
    conversation: Conversation,
    pending: NonNullable<Conversation["pendingToolCall"]>,
    controller: AbortController,
    logs: {
      onAbortedAfterTool: string;
      onContinue: string;
      onStop: string;
    },
  ): Promise<void> {
    try {
      let currentTool = pending.toolName;

      await this.toolExecutor.executeToolCall(
        conversation,
        {
          toolCallId: pending.toolCallId,
          name: pending.toolName,
          arguments: this.toToolCallArguments(pending.params),
        },
        pending.type,
        controller.signal,
        pending.updateTime,
      );

      if (conversation.isAborted || controller.signal.aborted) {
        logger.info(logs.onAbortedAfterTool);
        return;
      }

      const queuedToolCalls = ((
        pending as typeof pending & {
          queuedToolCalls?: Parameters<StreamHandler["processToolCalls"]>[1];
        }
      ).queuedToolCalls || []) as Parameters<StreamHandler["processToolCalls"]>[1];

      if (queuedToolCalls.length > 0) {
        currentTool = await this.streamHandler.processToolCalls(
          conversation,
          queuedToolCalls,
          controller.signal,
        );
      }

      if (
        conversation.isAborted ||
        controller.signal.aborted ||
        conversation.pendingToolCall ||
        conversation.status === "waiting_tool_confirmation"
      ) {
        logger.info(
          conversation.isAborted || controller.signal.aborted
            ? logs.onAbortedAfterTool
            : logs.onStop,
        );
        return;
      }

      const completion = this.normalizeCompletionDecision(
        await this.completionHandler.handleStreamCompletion(
          conversation,
          currentTool,
          this.toolExecutor.getLastToolHadError(),
          this.toolExecutor.getLastToolError(),
        ),
      );

      if (completion.shouldContinue && !conversation.isAborted) {
        logger.info(logs.onContinue);
        await this.executeLoop(conversation, completion.nextTurnMessages || []);
        return;
      }

      logger.info(logs.onStop);
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      if (
        err.name === "AbortError" ||
        conversation.isAborted ||
        controller.signal.aborted ||
        err.message === "interrupt"
      ) {
        logger.info(logs.onAbortedAfterTool);
        return;
      }

      this.streamHandler.resetErrorCount();
      conversation.status = "streaming";
      await this.executeLoop(conversation);
    } finally {
      if (this.currentAbortController === controller) {
        this.currentAbortController = null;
      }
    }
  }

  /**
   * 处理待确认的工具调用
   */
  private async handlePendingToolConfirmation(conversation: Conversation): Promise<void> {
    if (conversation.isAborted) {
      logger.info("[ConversationExecutor] 会话已中断，跳过待确认工具执行");
      return;
    }

    const pending = conversation.pendingToolCall;
    if (!pending) {
      return;
    }

    // 等待用户输入（此时应该已经有输入了，因为是 MessageResolver 触发的）
    await pWaitFor(() => !!conversation.userInput || conversation.isAborted);
    if (conversation.isAborted) {
      logger.info("[ConversationExecutor] 等待确认输入时检测到中断，停止执行");
      return;
    }
    const input = conversation.userInput;

    if (input === "confirm") {
      logger.info(`[ConversationExecutor] 用户确认执行工具 ${pending.toolName}`);
      this.startDetachedConfirmedToolExecution(conversation, pending, {
        onAbortedAfterTool: "[ConversationExecutor] 工具执行后检测到中断，停止 loop",
        onContinue: "[ConversationExecutor] 工具执行完毕，继续执行 loop",
        onStop: "[ConversationExecutor] 工具执行完毕，停止 loop",
      });
      return;
    } else {
      // reject 或 commonMessage，都视为拒绝/取消
      logger.info(`[ConversationExecutor] 用户拒绝/取消工具 ${pending.toolName}，输入: ${input}`);
      conversation.pendingToolCall = null;

      // MessageResolver 已经将其 added to memory。
      // 所以这里清除 userInput 是安全的，防止下次 execute 误判。
      conversation.userInput = "";

      // 添加系统消息说明工具被取消
      conversation.memory.addMessage({
        role: "user",
        content: `用户取消了工具 '${pending.toolName}' 的执行。`,
        type: "system",
        partial: false,
      });

      if (conversation.isAborted) {
        logger.info("[ConversationExecutor] 拒绝工具后检测到中断，停止 loop");
        return;
      }
      return this.executeLoop(conversation);
    }
  }

  /**
   * 执行主循环
   */
  private async executeLoop(
    conversation: Conversation,
    ephemeralMessages: ChatMessage[] = [],
  ): Promise<void> {
    if (conversation.isAborted) {
      logger.info("检测到中断状态，停止执行循环");
      return;
    }

    const injectedContinuation = await flushConversationContinuationsBeforeNextTurn(conversation);
    if (conversation.isAborted) {
      logger.info("[ConversationExecutor] 注入 continuation 后检测到中断，停止执行循环");
      return;
    }
    if (injectedContinuation) {
      logger.info("[ConversationExecutor] 已在新一轮执行前注入 continuation");
    }

    const controller = new AbortController();
    this.currentAbortController = controller;

    try {
      const streamResult = await this.streamHandler.handleStream(
        conversation,
        controller,
        ephemeralMessages,
      );

      if (streamResult.currentTool === "interrupt" || conversation.isAborted) {
        logger.info(`[ConversationExecutor] 检测到中断，停止执行循环`);
        return;
      }

      if (streamResult.toolCalls.length > 0) {
        if (this.currentAbortController === controller) {
          this.currentAbortController = null;
        }
        this.startDetachedToolExecution(conversation, streamResult.toolCalls, {
          onAbortedAfterTool: "[ConversationExecutor] 工具执行后检测到中断，停止 loop",
          onContinue: "[ConversationExecutor] 工具执行完毕，继续执行 loop",
          onStop: "[ConversationExecutor] 工具执行完毕，停止 loop",
        });
        return;
      }

      const completion = this.normalizeCompletionDecision(
        await this.completionHandler.handleStreamCompletion(
          conversation,
          streamResult.currentTool,
          this.toolExecutor.getLastToolHadError(),
          this.toolExecutor.getLastToolError(),
        ),
      );

      logger.info(
        `[ConversationExecutor] handleStreamCompletion 返回: shouldContinue=${completion.shouldContinue}, nextTurnMessages=${completion.nextTurnMessages?.length || 0}, currentTool: ${streamResult.currentTool}, hadError: ${this.toolExecutor.getLastToolHadError()}, isAborted: ${conversation.isAborted}`,
      );

      if (completion.shouldContinue && !conversation.isAborted) {
        logger.info(`[ConversationExecutor] 继续执行循环`);
        return this.executeLoop(conversation, completion.nextTurnMessages || []);
      } else {
        logger.info(`[ConversationExecutor] 停止执行循环`);
      }
    } catch (error: unknown) {
      if (this.currentAbortController === controller) {
        this.currentAbortController = null;
      }

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
      if (this.currentAbortController === controller) {
        this.currentAbortController = null;
      }
    }
  }
}
