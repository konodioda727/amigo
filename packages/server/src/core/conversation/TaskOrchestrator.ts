import type { SERVER_SEND_MESSAGE_NAME, ToolInterface } from "@amigo-llm/types";
import pWaitFor from "p-wait-for";
import { logger } from "@/utils/logger";
import { getLlm } from "../model";
import type { Conversation } from "./Conversation";
import { ConversationExecutor } from "./ConversationExecutor";
import { conversationRepository } from "./ConversationRepository";
import { SubTaskManager } from "./SubTaskManager";
import { broadcaster } from "./WebSocketBroadcaster";

export interface SubTaskParams {
  subPrompt: string;
  target: string;
  parentId: string;
  // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
  tools: ToolInterface<any>[];
  index?: number;
  taskDescription?: string; // 可选：用于 SubTaskManager 记录状态
}

/**
 * 任务编排器 - 管理父子任务关系和子任务执行
 */
export class TaskOrchestrator {
  private executors = new Map<string, ConversationExecutor>();

  /**
   * 获取或创建会话的执行器
   */
  getExecutor(conversationId: string): ConversationExecutor {
    let executor = this.executors.get(conversationId);
    if (!executor) {
      executor = new ConversationExecutor();
      this.executors.set(conversationId, executor);
    }
    return executor;
  }

  /**
   * 移除执行器
   */
  removeExecutor(conversationId: string): void {
    this.executors.delete(conversationId);
  }

  /**
   * 创建并运行子任务
   */
  async runSubTask(params: SubTaskParams): Promise<{ subTaskId: string; result: string }> {
    const { subPrompt, parentId, tools, target, index = 0, taskDescription } = params;

    // 获取父会话
    const parentConversation = conversationRepository.get(parentId);
    if (!parentConversation) {
      throw new Error(`未找到父会话，父任务ID：${parentId}`);
    }

    // 创建子会话
    const subConversation = conversationRepository.create({
      type: "sub",
      parentId,
      customPrompt: subPrompt,
      tools,
      llm: getLlm(),
    });

    // 如果提供了 taskDescription，记录到 SubTaskManager
    if (taskDescription) {
      const subTaskManager = new SubTaskManager(parentId);
      subTaskManager.markTaskInProgress(taskDescription, subConversation.id);
    }

    // 保存工具名称用于恢复
    const toolNames = tools.map((t) => t.name);
    subConversation.memory.setToolNames(toolNames);

    // 发送子任务创建消息
    const createdMessage = {
      type: "assignTaskUpdated" as SERVER_SEND_MESSAGE_NAME,
      data: {
        index,
        taskId: subConversation.id,
        parentTaskId: parentId,
        taskStatus: "running" as const,
      },
    };
    parentConversation.memory.addWebsocketMessage(createdMessage);
    broadcaster.broadcast(parentId, createdMessage);

    // 设置用户输入并启动执行
    this.setUserInput(subConversation, target);

    const executor = this.getExecutor(subConversation.id);
    executor.execute(subConversation);

    // 等待子任务完成
    await pWaitFor(() => subConversation.status === "completed", {
      timeout: 30 * 60 * 1000,
    });

    logger.info(`子会话 ${subConversation.id} 已完成。`);

    // 如果提供了 taskDescription，更新状态为完成
    if (taskDescription) {
      const { SubTaskManager } = await import("./SubTaskManager");
      const subTaskManager = new SubTaskManager(parentId);
      subTaskManager.markTaskCompleted(taskDescription);
    }

    // 发送子任务完成消息
    const completedMessage = {
      type: "assignTaskUpdated" as SERVER_SEND_MESSAGE_NAME,
      data: {
        index,
        taskId: subConversation.id,
        parentTaskId: parentId,
        taskStatus: "completed" as const,
      },
    };
    parentConversation.memory.addWebsocketMessage(completedMessage);
    broadcaster.broadcast(parentId, completedMessage);

    // 清理执行器
    this.removeExecutor(subConversation.id);

    // 获取结果并返回子任务 ID
    return {
      subTaskId: subConversation.id,
      result: this.getCompletionResult(subConversation),
    };
  }

  /**
   * 设置用户输入
   */
  setUserInput(conversation: Conversation, message: string): void {
    logger.info(
      `[TaskOrchestrator] setUserInput - taskId: ${conversation.id}, message: ${message}`,
    );

    conversation.userInput = message;
    conversation.isAborted = false;

    conversation.memory.addMessage({
      role: "user",
      content: message,
      type: "userSendMessage",
      partial: false,
    });

    const wsMessage = {
      type: "userSendMessage" as const,
      data: {
        message,
        updateTime: Date.now(),
        taskId: conversation.id,
      },
    };
    conversation.memory.addWebsocketMessage(wsMessage);
  }

  /**
   * 中断会话
   */
  interrupt(conversation: Conversation): void {
    if (["aborted", "idle", "completed"].includes(conversation.status)) {
      logger.info(`会话状态为 ${conversation.status}，无需打断。`);
      return;
    }

    // 如果正在等待工具确认，取消确认
    if (conversation.status === "waiting_tool_confirmation") {
      logger.info("取消工具确认");
      conversation.pendingToolCall = null;
      conversation.status = "aborted";
      conversation.userInput = "";

      broadcaster.broadcast(conversation.id, {
        type: "conversationOver",
        data: { reason: "interrupt" },
      });

      return;
    }

    logger.info("会话已被打断。");
    conversation.isAborted = true;

    // 中断 LLM 请求
    const executor = this.executors.get(conversation.id);
    const controller = executor?.getCurrentAbortController();
    if (controller) {
      controller.abort();
      executor?.clearAbortController();
    }

    conversation.memory.addMessage({
      role: "assistant",
      content: "用户已打断会话。",
      type: "interrupt",
      partial: false,
    });

    const interruptMessage = {
      type: "interrupt" as const,
      data: {
        taskId: conversation.id,
        updateTime: Date.now(),
      },
    };
    conversation.memory.addWebsocketMessage(interruptMessage);
    broadcaster.broadcast(conversation.id, interruptMessage);

    conversation.status = "aborted";
    conversation.userInput = "";

    broadcaster.broadcast(conversation.id, {
      type: "conversationOver",
      data: { reason: "interrupt" },
    });

    // 递归中断所有子任务
    this.interruptChildren(conversation.id);
  }

  /**
   * 中断所有子任务
   */
  private interruptChildren(parentId: string): void {
    for (const conv of conversationRepository.getAll()) {
      if (conv.parentId === parentId && conv.status !== "aborted" && conv.status !== "completed") {
        this.interrupt(conv);
      }
    }
  }

  /**
   * 恢复会话
   */
  resume(conversation: Conversation): void {
    logger.info("会话已恢复。");
    conversation.isAborted = false;
    conversation.status = "streaming";
    conversation.userInput = "请继续完成之前被中断的任务。";
  }

  /**
   * 获取完成结果
   */
  private getCompletionResult(conversation: Conversation): string {
    const messages = conversation.memory.messages;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.type === "completionResult" && messages[i]?.role === "assistant") {
        return messages[i]?.content || "";
      }
    }

    const lastMessage = conversation.memory.lastMessage;
    if (!lastMessage) {
      throw new Error(`子会话 ${conversation.id} 没有返回最终消息`);
    }
    return lastMessage.content;
  }
}

// 全局单例
export const taskOrchestrator = new TaskOrchestrator();
