import type { ConversationStatus } from "@amigo/types";
import type { MessageEmitter } from "./MessageEmitter";
import { logger } from "@/utils/logger";
import pWaitFor from "p-wait-for";

interface ErrorHandlerConfig {
  messageEmitter: MessageEmitter;
  getUserInput: () => string;
  setUserInput: (input: string) => void;
  setConversationStatus: (status: ConversationStatus) => void;
}

/**
 * 错误处理器 - 负责错误计数和处理逻辑
 */
export class ErrorHandler {
  private consecutiveErrorCount: number = 0;
  private messageEmitter: MessageEmitter;
  private getUserInput: () => string;
  private setUserInput: (input: string) => void;
  private setConversationStatus: (status: ConversationStatus) => void;

  constructor(config: ErrorHandlerConfig) {
    this.messageEmitter = config.messageEmitter;
    this.getUserInput = config.getUserInput;
    this.setUserInput = config.setUserInput;
    this.setConversationStatus = config.setConversationStatus;
  }

  /**
   * 重置错误计数
   */
  public resetErrorCount(): void {
    this.consecutiveErrorCount = 0;
  }

  /**
   * 处理错误
   */
  public async handleError(error: any): Promise<void> {
    this.consecutiveErrorCount++;
    logger.error(`流式响应过程中出现错误 (${this.consecutiveErrorCount}/3):`, error);

    this.messageEmitter.postMessage({
      type: "error",
      role: "system",
      content: error.message,
    });

    // 如果连续3次错误，需要用户确认
    if (this.consecutiveErrorCount >= 3) {
      await this.handleConsecutiveErrors(error);
    }

    this.setConversationStatus("error");
  }

  /**
   * 处理连续错误
   */
  private async handleConsecutiveErrors(error: any): Promise<void> {
    logger.warn("⚠️  连续出现3次错误，需要用户确认是否继续");

    this.setConversationStatus("error");
    this.setUserInput("");

    // 发送 alert 消息给前端并保存到 websocket 历史
    this.messageEmitter.emitAndSaveMessage({
      type: "alert",
      data: {
        message: `连续出现 ${this.consecutiveErrorCount} 次错误，最后一次错误：${error.message}\n\n是否继续尝试？请输入新的指令或调整任务。`,
        severity: "error",
        updateTime: Date.now(),
      },
    });

    // 重置错误计数，等待用户输入
    this.consecutiveErrorCount = 0;
    await pWaitFor(() => !!this.getUserInput());
  }
}
