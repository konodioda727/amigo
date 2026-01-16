import type { ChatMessage } from "@amigo-llm/types";
import { systemReservedTags } from "@amigo-llm/types";
import type { ToolExecutionContext } from "@amigo-llm/types/src/tool";
import pWaitFor from "p-wait-for";
import { isWhitespaceOnly } from "@/utils/isWhiteSpaceOnly";
import { logger } from "@/utils/logger";
import { parseStreamingXml } from "@/utils/parseStreamingXml";
import { sandboxRegistry } from "../sandbox";
import type { Conversation } from "./Conversation";
import { broadcaster } from "./WebSocketBroadcaster";

interface ToolContent {
  toolName: string;
  params?: unknown;
  result?: unknown;
  error?: string;
}

/**
 * 会话执行器 - 负责 LLM 交互和工具执行
 * 无状态服务，所有状态都在 Conversation 中
 */
export class ConversationExecutor {
  private currentAbortController: AbortController | null = null;
  private consecutiveErrorCount = 0;
  private lastToolHadError = false; // 跟踪最后一个工具是否有错误
  private lastToolError: { toolName: string; error: string; type: ChatMessage["type"] } | null =
    null; // 存储错误详情

  /**
   * 执行会话
   */
  async execute(conversation: Conversation): Promise<void> {
    // 等待用户输入
    await pWaitFor(() => !!conversation.userInput);
    conversation.status = "streaming";
    await this.handleStream(conversation);
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
   * 处理流式响应
   */
  private async handleStream(conversation: Conversation): Promise<void> {
    if (conversation.isAborted) {
      logger.info("检测到中断状态，停止 handleStream");
      return;
    }

    const controller = new AbortController();
    this.currentAbortController = controller;

    try {
      const stream = await conversation.llm.stream(conversation.memory.messages, {
        signal: controller.signal,
      });

      const startLabels = this.buildStartLabels(conversation);
      const callbacks = this.createStreamCallbacks(conversation);

      // 重置工具错误标志
      this.lastToolHadError = false;
      this.lastToolError = null;

      const currentTool = await parseStreamingXml({
        stream,
        startLabels,
        signal: controller.signal,
        ...callbacks,
      });

      if (currentTool === "interrupt") {
        logger.info("\n会话已通过打断信号结束。");
        return;
      }

      this.consecutiveErrorCount = 0;

      const shouldContinue = await this.handleStreamCompletion(
        conversation,
        currentTool,
        this.lastToolHadError,
      );
      logger.info(
        `[ConversationExecutor] handleStreamCompletion 返回: ${shouldContinue}, currentTool: ${currentTool}, hadError: ${this.lastToolHadError}, isAborted: ${conversation.isAborted}`,
      );
      if (shouldContinue && !conversation.isAborted) {
        logger.info(`[ConversationExecutor] 继续执行 handleStream loop`);
        this.handleStream(conversation);
      } else {
        logger.info(`[ConversationExecutor] 停止 handleStream loop`);
      }
    } catch (error: unknown) {
      this.currentAbortController = null;

      const err = error as Error & { name?: string };
      if (err.name === "AbortError" || conversation.isAborted) {
        logger.info("流式响应被用户中断");
        await pWaitFor(() => !!conversation.userInput);
        this.handleStream(conversation);
        return;
      }

      await this.handleError(conversation, err);
      this.handleStream(conversation);
    } finally {
      if (this.currentAbortController) {
        this.currentAbortController = null;
      }
    }
  }

  /**
   * 构建 XML 解析的起始标签
   */
  private buildStartLabels(conversation: Conversation): string[] {
    return conversation.toolService.toolNames.concat(systemReservedTags).map((name) => `<${name}>`);
  }

  /**
   * 创建流解析回调
   */
  private createStreamCallbacks(conversation: Conversation) {
    return {
      onPartialMessageFound: async (message: string) => {
        broadcaster.postMessage(conversation, {
          role: "assistant",
          content: message,
          type: "message",
          partial: true,
        });
      },
      onMessageLeft: async (message: string) => {
        if (!isWhitespaceOnly(message)) {
          broadcaster.postMessage(conversation, {
            role: "assistant",
            content: message,
            type: "message",
            partial: false,
          });
        }
      },
      onCommonMessageFound: async (message: string) => {
        broadcaster.postMessage(conversation, {
          role: "assistant",
          content: message,
          type: "message",
          partial: false,
        });
      },
      onFullToolCallFound: async (
        fullToolCall: string,
        currentTool: string,
        currentType: ChatMessage["type"],
      ) => {
        conversation.status = "tool_executing";
        await this.executeToolCall(conversation, fullToolCall, currentTool, currentType);
      },
      onPartialToolCallFound: async (
        partialToolCall: string,
        currentTool: string,
        currentType: ChatMessage["type"],
      ) => {
        this.handlePartialToolCall(conversation, partialToolCall, currentTool, currentType);
      },
    };
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(
    conversation: Conversation,
    fullToolCall: string,
    toolName: string,
    type: ChatMessage["type"],
  ): Promise<void> {
    // 发送 partial 消息 - 使用 partial: true 避免参数验证错误
    const { params: partialParams } = conversation.toolService.parseParams(fullToolCall, true);
    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: JSON.stringify({
        params: partialParams,
        toolName,
      } satisfies ToolContent),
      originalMessage: fullToolCall,
      type,
      partial: true,
    });

    // 构建执行上下文
    const context: ToolExecutionContext = {
      taskId: conversation.id,
      parentId: conversation.parentId,
      getSandbox: () => sandboxRegistry.getOrCreate(conversation.parentId || conversation.id),
      getToolByName: (name: string) => conversation.toolService.getToolFromName(name),
      signal: this.currentAbortController?.signal,
      postMessage: (msg: string | object) => {
        broadcaster.postMessage(conversation, {
          role: "assistant",
          content: typeof msg === "string" ? msg : JSON.stringify(msg),
          type: "message",
          partial: true,
        });
      },
    };

    // 执行工具
    const { toolResult, message, params, error } = await conversation.toolService.parseAndExecute({
      xmlParams: fullToolCall,
      context,
    });

    if (error) {
      logger.error(`[ConversationExecutor] 工具调用错误: ${error}`);
      this.lastToolHadError = true;
      this.lastToolError = { toolName, error, type };

      // 发送错误的 WebSocket 消息（使用 partial: true 表示这不是最终状态）
      broadcaster.postMessage(conversation, {
        role: "assistant",
        content: JSON.stringify({
          result: "",
          params,
          toolName,
          error,
        } satisfies ToolContent),
        originalMessage: fullToolCall,
        type,
        partial: true, // 使用 partial: true 表示工具调用未完成
      });

      logger.info(
        `[ConversationExecutor] 工具错误已记录，将在 handleStreamCompletion 中添加到 memory`,
      );
    } else {
      this.handleToolSuccess(
        conversation,
        toolName,
        params,
        toolResult,
        message,
        fullToolCall,
        type,
      );
    }
  }

  /**
   * 处理工具执行成功
   */
  private handleToolSuccess(
    conversation: Conversation,
    toolName: string,
    params: unknown,
    result: unknown,
    message: string,
    originalMessage: string,
    type: ChatMessage["type"],
  ): void {
    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: JSON.stringify({
        result,
        params,
        toolName,
      } satisfies ToolContent),
      originalMessage,
      type,
      partial: false,
    });

    conversation.memory.addMessage({
      role: "system",
      content: `当前工具调用：${toolName}，\n工具执行信息：\n${message}\n`,
      type,
      partial: false,
    });
  }

  /**
   * 处理工具执行错误（仅发送 WebSocket 消息）
   */
  private handleToolError(
    conversation: Conversation,
    toolName: string,
    params: unknown,
    error: string,
    originalMessage: string,
    type: ChatMessage["type"],
  ): void {
    // 工具执行错误时，不发送 partial: false 消息
    // 因为这不是一个"完成"的工具调用，而是一个失败的调用
    // 错误信息会在 handleStreamCompletion 中作为 system 消息添加到 memory
    // 这里不发送任何 WebSocket 消息，避免前端误认为工具调用完成
  }

  /**
   * 处理 partial 工具调用
   */
  private handlePartialToolCall(
    conversation: Conversation,
    partialToolCall: string,
    toolName: string,
    type: ChatMessage["type"],
  ): void {
    const { params } = conversation.toolService.parseParams(partialToolCall, true);
    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: JSON.stringify({
        params,
        result: "",
        toolName,
      } satisfies ToolContent),
      originalMessage: partialToolCall,
      type,
      partial: true,
    });
  }

  /**
   * 处理流完成后的逻辑
   */
  private async handleStreamCompletion(
    conversation: Conversation,
    currentTool: string,
    hadError: boolean,
  ): Promise<boolean> {
    logger.info(
      `[ConversationExecutor] handleStreamCompletion called with currentTool: ${currentTool}, hadError: ${hadError}`,
    );

    // 如果工具执行出错，添加错误信息到 memory 并继续 loop 让 AI 重试
    if (hadError && this.lastToolError) {
      const { toolName, error, type } = this.lastToolError;
      logger.info(`[ConversationExecutor] 工具执行出错，添加错误信息到 memory`);

      // 检测是否是格式错误（包含 "XML 解析错误" 或 "缺少必需参数"）
      const isFormatError = error.includes("XML 解析错误") || error.includes("缺少必需参数");

      conversation.memory.addMessage({
        role: "system",
        content: `❌ 工具调用失败：${toolName}\n\n错误原因：${error}\n\n${isFormatError ? "⚠️ 这是格式错误！请严格按照以下格式调用工具：\n\n" : ""}请仔细阅读工具定义和示例，确保：\n1. 使用正确的 XML 子标签结构（不是属性格式）\n2. 提供所有必需参数\n3. 参数格式符合要求\n\n${isFormatError ? '❌ 错误示例（属性格式）：\n<askFollowupQuestion question="问题" suggestOptions="选项"/>\n\n✅ 正确示例（子标签格式）：\n<askFollowupQuestion>\n  <question>问题</question>\n  <suggestOptions>\n    <option>选项1</option>\n    <option>选项2</option>\n  </suggestOptions>\n</askFollowupQuestion>\n\n' : ""}完整的使用示例请参考工具定义中的 useExamples。`,
        type,
        partial: false,
      });

      conversation.status = "streaming";
      return true;
    }

    switch (currentTool) {
      case "completionResult":
        logger.info("\n对话已完成。");
        conversation.status = "completed";
        if (conversation.type !== "main") {
          return false;
        }
        conversation.userInput = "";
        broadcaster.broadcast(conversation.id, {
          type: "conversationOver",
          data: { reason: "completionResult" },
        });
        await pWaitFor(() => !!conversation.userInput);
        return true;

      case "askFollowupQuestion":
        conversation.userInput = "";
        broadcaster.broadcast(conversation.id, {
          type: "conversationOver",
          data: { reason: "askFollowupQuestion" },
        });
        await pWaitFor(() => !!conversation.userInput);
        return true;

      case "message":
        logger.warn("\n⚠️  LLM 未使用任何工具或结束标签，添加惩罚提示");
        conversation.memory.addMessage({
          role: "system",
          content: `警告：你的上一次回复只包含普通消息，没有使用任何工具或调用结束标签。

请注意：
1. 如果任务已完成，必须使用 <completionResult> 标签结束任务
2. 如果需要用户提供更多信息，必须使用 <askFollowupQuestion> 标签提问
3. 如果需要执行操作，必须调用相应的工具（如 <assignTask>、<updateTodoList> 等）
4. 不要只输出普通文本消息后就停止

请立即采取正确的行动。`,
          type: "message",
          partial: false,
        });
        conversation.status = "streaming";
        return true;

      default:
        logger.info(`[ConversationExecutor] default 分支: 设置 status 为 idle，返回 true`);
        conversation.status = "idle";
        return true;
    }
  }

  /**
   * 处理错误
   */
  private async handleError(conversation: Conversation, error: Error): Promise<void> {
    this.consecutiveErrorCount++;
    logger.error(`流式响应过程中出现错误 (${this.consecutiveErrorCount}/3):`, error);

    broadcaster.postMessage(conversation, {
      type: "error",
      role: "system",
      content: error.message,
    });

    if (this.consecutiveErrorCount >= 3) {
      await this.handleConsecutiveErrors(conversation, error);
    }

    conversation.status = "error";
  }

  /**
   * 处理连续错误
   */
  private async handleConsecutiveErrors(conversation: Conversation, error: Error): Promise<void> {
    logger.warn("⚠️  连续出现3次错误，需要用户确认是否继续");

    conversation.status = "error";
    conversation.userInput = "";

    broadcaster.emitAndSave(conversation, {
      type: "alert",
      data: {
        message: `连续出现 ${this.consecutiveErrorCount} 次错误，最后一次错误：${error.message}\n\n是否继续尝试？请输入新的指令或调整任务。`,
        severity: "error",
        updateTime: Date.now(),
      },
    });

    this.consecutiveErrorCount = 0;
    await pWaitFor(() => !!conversation.userInput);
  }
}
