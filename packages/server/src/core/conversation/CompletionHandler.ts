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
      case "completionResult":
        return this.handleCompletionResult(conversation);

      case "completeTask":
        return this.handleCompleteTask(conversation);

      case "createTaskDocs":
        return this.handleCreateTaskDocs(conversation);

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
    const { toolName, error, type } = toolError;
    logger.info(`[CompletionHandler] 工具执行出错，添加错误信息到 memory`);

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

  /**
   * 处理 completionResult 工具
   */
  private handleCompletionResult(conversation: Conversation): boolean {
    logger.info("\n对话已完成。");
    conversation.status = "completed";

    // 无论是主任务还是子任务，都需要广播 conversationOver
    broadcaster.broadcast(conversation.id, {
      type: "conversationOver",
      data: {
        reason: "completionResult",
      },
    });

    if (conversation.type !== "main") {
      // 子任务完成后直接返回 false，不需要等待用户输入
      logger.info(`[CompletionHandler] 子任务 ${conversation.id} 已完成`);
      return false;
    }

    // 主任务完成后，清空用户输入并停止循环
    conversation.userInput = "";
    return false;
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

    // 子任务完成后直接返回 false，不需要等待用户输入
    logger.info(`[CompletionHandler] 子任务 ${conversation.id} 已通过 completeTask 完成`);
    return false;
  }

  /**
   * 处理 createTaskDocs 工具
   */
  private handleCreateTaskDocs(conversation: Conversation): boolean {
    // 创建任务文档后，需要用户确认
    conversation.status = "idle";
    conversation.userInput = "";
    broadcaster.broadcast(conversation.id, {
      type: "conversationOver",
      data: {
        reason: "createTaskDocs",
      },
    });
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
1. 如果任务已完成，必须使用 <completeTask> 标签返回结果（不是 completionResult）
2. 如果需要更多信息，必须使用 <askFollowupQuestion> 标签提问
3. 如果需要执行操作，必须调用相应的工具（如 <browserSearch>、<bash> 等）
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
  private handleDefault(conversation: Conversation, _currentTool: string): boolean {
    logger.info(`[CompletionHandler] default 分支: 设置 status 为 idle，返回 true`);
    conversation.status = "idle";
    return true;
  }
}
