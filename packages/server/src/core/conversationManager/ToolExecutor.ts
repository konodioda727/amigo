import type { ChatMessage, TransportToolContent } from "@amigo-llm/types";
import { logger } from "@/utils/logger";
import type { FilePersistedMemory } from "../memory";
import type { ToolService } from "../tools";
import type { MessageEmitter } from "./MessageEmitter";

interface ToolExecutorConfig {
  toolService: ToolService;
  messageEmitter: MessageEmitter;
  memory: FilePersistedMemory;
}

/**
 * 工具执行器 - 负责工具的执行和结果处理
 */
export class ToolExecutor {
  private toolService: ToolService;
  private messageEmitter: MessageEmitter;
  private memory: FilePersistedMemory;

  constructor(config: ToolExecutorConfig) {
    this.toolService = config.toolService;
    this.messageEmitter = config.messageEmitter;
    this.memory = config.memory;
  }

  /**
   * 处理工具执行
   */
  public async handleToolExecution(
    fullToolCall: string,
    currentTool: string,
    currentType: ChatMessage["type"],
  ): Promise<void> {
    // 发送 partial 消息
    this.sendPartialToolMessage(fullToolCall, currentTool, currentType);

    // 执行工具
    const { toolResult, message, params, error } = await this.toolService.parseAndExecute({
      xmlParams: fullToolCall,
      getCurrentTask: () => this.memory.currentTaskId,
    });

    if (error) {
      logger.error(`[ToolExecutor] 工具调用错误: ${error}`);
      this.handleToolError(currentTool, params, error, fullToolCall, currentType);
    } else {
      this.handleToolSuccess(currentTool, params, toolResult, message, fullToolCall, currentType);
    }
  }

  /**
   * 发送 partial 工具消息
   */
  private sendPartialToolMessage(
    fullToolCall: string,
    toolName: string,
    type: ChatMessage["type"],
  ): void {
    this.messageEmitter.postMessage({
      role: "assistant",
      content: JSON.stringify({
        params: this.toolService.parseParams(fullToolCall).params,
        toolName,
      } as TransportToolContent<any>),
      originalMessage: fullToolCall,
      type,
      partial: true,
    });
  }

  /**
   * 处理工具执行成功
   */
  private handleToolSuccess(
    toolName: string,
    params: any,
    result: any,
    message: string,
    originalMessage: string,
    type: ChatMessage["type"],
  ): void {
    this.messageEmitter.postMessage({
      role: "assistant",
      content: JSON.stringify({
        result,
        params,
        toolName,
      } as TransportToolContent<any>),
      originalMessage,
      type,
      partial: false,
    });

    this.memory.addMessage({
      role: "system",
      content: `当前工具调用：${toolName}，\n工具执行信息：\n${message}\n`,
      type,
      partial: false,
    });
  }

  /**
   * 处理工具执行错误
   */
  private handleToolError(
    toolName: string,
    params: any,
    error: string,
    originalMessage: string,
    type: ChatMessage["type"],
  ): void {
    // 发送错误消息
    this.messageEmitter.postMessage({
      role: "assistant",
      content: JSON.stringify({
        result: "",
        params,
        toolName,
        error,
      } as any),
      originalMessage,
      type,
      partial: false,
    });

    // 添加惩罚消息
    this.memory.addMessage({
      role: "system",
      content: `❌ 工具调用失败：${toolName}\n\n错误原因：${error}\n\n请仔细阅读工具定义和示例，确保：\n1. 使用正确的 XML 标签结构\n2. 提供所有必需参数\n3. 参数格式符合要求\n\n正确的使用示例请参考工具定义中的 useExamples。`,
      type,
      partial: false,
    });
  }

  /**
   * 处理 partial 工具调用
   */
  public handlePartialToolCall(
    partialToolCall: string,
    currentTool: string,
    currentType: ChatMessage["type"],
  ): void {
    const { params } = this.toolService.parseParams(partialToolCall, true);
    this.messageEmitter.postMessage({
      role: "assistant",
      content: JSON.stringify({
        params,
        result: "",
        toolName: currentTool,
      } as TransportToolContent<any>),
      originalMessage: partialToolCall,
      type: currentType,
      partial: true,
    });
  }
}
