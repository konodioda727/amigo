import type { ChatMessage, ConversationStatus } from "@amigo/types";
import type { FilePersistedMemory } from "../memory";
import type { MessageEmitter } from "./MessageEmitter";
import type { ToolExecutor } from "./ToolExecutor";
import type { ErrorHandler } from "./ErrorHandler";
import { parseStreamingXml } from "@/utils/parseStreamingXml";
import { isWhitespaceOnly } from "@/utils/isWhiteSpaceOnly";
import { logger } from "@/utils/logger";
import pWaitFor from "p-wait-for";

interface StreamHandlerConfig {
  llm: any;
  memory: FilePersistedMemory;
  messageEmitter: MessageEmitter;
  toolExecutor: ToolExecutor;
  errorHandler: ErrorHandler;
  startLabels: string[];
  conversationType: "main" | "sub";
  getUserInput: () => string;
  setUserInput: (input: string) => void;
  getConversationStatus: () => ConversationStatus;
  setConversationStatus: (status: ConversationStatus) => void;
  isAborted: () => boolean;
}

/**
 * 流处理器 - 负责 LLM 流式响应的处理
 */
export class StreamHandler {
  private currentAbortController: AbortController | null = null;
  private llm: any;
  private memory: FilePersistedMemory;
  private messageEmitter: MessageEmitter;
  private toolExecutor: ToolExecutor;
  private errorHandler: ErrorHandler;
  private startLabels: string[];
  private conversationType: "main" | "sub";
  private getUserInput: () => string;
  private setUserInput: (input: string) => void;
  private getConversationStatus: () => ConversationStatus;
  private setConversationStatus: (status: ConversationStatus) => void;
  private isAborted: () => boolean;

  constructor(config: StreamHandlerConfig) {
    this.llm = config.llm;
    this.memory = config.memory;
    this.messageEmitter = config.messageEmitter;
    this.toolExecutor = config.toolExecutor;
    this.errorHandler = config.errorHandler;
    this.startLabels = config.startLabels;
    this.conversationType = config.conversationType;
    this.getUserInput = config.getUserInput;
    this.setUserInput = config.setUserInput;
    this.getConversationStatus = config.getConversationStatus;
    this.setConversationStatus = config.setConversationStatus;
    this.isAborted = config.isAborted;
  }

  /**
   * 获取当前的 AbortController
   */
  public getCurrentAbortController(): AbortController | null {
    return this.currentAbortController;
  }

  /**
   * 清除 AbortController
   */
  public clearAbortController(): void {
    this.currentAbortController = null;
  }

  /**
   * 处理流式响应
   */
  public async handleStream(): Promise<void> {
    const controller = new AbortController();
    const { signal } = controller;

    this.currentAbortController = controller;

    try {
      const stream = await this.llm.stream(this.memory.messages, { signal });

      const callbacks = this.createStreamCallbacks();
      const currentTool = await parseStreamingXml({
        stream,
        startLabels: this.startLabels,
        signal,
        ...callbacks,
      });

      // 如果被中断，直接返回
      if (currentTool === "interrupt") {
        logger.info("\n会话已通过打断信号结束。");
        this.setConversationStatus("idle");
        this.setUserInput("");
        this.messageEmitter.emitMessage({
          type: "conversationOver",
          data: { reason: "interrupt" },
        });
        return;
      }

      // 成功执行，重置错误计数
      this.errorHandler.resetErrorCount();

      // 处理完成逻辑
      await this.handleStreamCompletion(currentTool);
      this.handleStream();
    } catch (error: any) {
      this.currentAbortController = null;

      // 如果是用户主动中断，不作为错误处理
      if (error.name === "AbortError" || this.isAborted()) {
        logger.info("流式响应被用户中断");
        this.setConversationStatus("idle");
        this.setUserInput("");
        this.messageEmitter.emitMessage({
          type: "conversationOver",
          data: { reason: "interrupt" },
        });
        await pWaitFor(() => !!this.getUserInput());
        this.handleStream();
        return;
      }

      // 处理错误
      await this.errorHandler.handleError(error);
      this.handleStream();
    } finally {
      if (this.currentAbortController) {
        this.currentAbortController = null;
      }
    }
  }

  /**
   * 创建 stream 解析回调
   */
  private createStreamCallbacks() {
    return {
      onPartialMessageFound: async (message: string) => {
        this.messageEmitter.postMessage({
          role: "assistant",
          content: message,
          type: "message",
          partial: true,
        });
      },
      onMessageLeft: async (message: string) => {
        if (!isWhitespaceOnly(message)) {
          this.messageEmitter.postMessage({
            role: "assistant",
            content: message,
            type: "message",
            partial: false,
          });
        }
      },
      onCommonMessageFound: async (message: string) => {
        this.messageEmitter.postMessage({
          role: "assistant",
          content: message,
          type: "message",
          partial: false,
        });
      },
      onFullToolCallFound: async (
        fullToolCall: string,
        currentTool: string,
        currentType: ChatMessage["type"]
      ) => {
        this.setConversationStatus("tool_executing");
        await this.toolExecutor.handleToolExecution(fullToolCall, currentTool, currentType);
      },
      onPartialToolCallFound: async (
        partialToolCall: string,
        currentTool: string,
        currentType: ChatMessage["type"]
      ) => {
        this.toolExecutor.handlePartialToolCall(partialToolCall, currentTool, currentType);
      },
    };
  }

  /**
   * 处理 stream 完成后的逻辑
   */
  private async handleStreamCompletion(currentTool: string): Promise<void> {
    switch (currentTool) {
      case "completionResult":
        logger.info("\n对话已完成。");
        this.setConversationStatus("completed");
        if (this.conversationType !== "main") {
          return;
        }
        this.setUserInput("");
        this.messageEmitter.emitMessage({
          type: "conversationOver",
          data: { reason: "completionResult" },
        });
        await pWaitFor(() => !!this.getUserInput());
        break;
      case "askFollowupQuestion":
        this.setUserInput("");
        this.messageEmitter.emitMessage({
          type: "conversationOver",
          data: { reason: "askFollowupQuestion" },
        });
        await pWaitFor(() => !!this.getUserInput());
        break;
      case "message":
        logger.warn("\n⚠️  LLM 未使用任何工具或结束标签，添加惩罚提示");
        this.memory.addMessage({
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
        this.setConversationStatus("idle");
        break;
      default:
        this.setConversationStatus("idle");
    }
  }
}
