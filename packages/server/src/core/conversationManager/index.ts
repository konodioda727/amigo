import type {
  ChatMessage,
  ConversationStatus,
  SERVER_SEND_MESSAGE_NAME,
  ToolInterface,
  TransportToolContent,
  WebSocketMessage,
} from "@amigo/types";
import type { ServerWebSocket } from "bun";
import pWaitFor from "p-wait-for";
import { systemReservedTags } from "@amigo/types";
import { FilePersistedMemory } from "../memory";
import { getLlm } from "../model";
import { getSystemPrompt } from "../systemPrompt";
import { BASIC_TOOLS, CUSTOMED_TOOLS, ToolService } from "../tools";
import { isWhitespaceOnly } from "@/utils/isWhiteSpaceOnly";
import { v4 as uuidV4 } from "uuid";
import { parseStreamingXml } from "@/utils/parseStreamingXml";
import { logger } from "@/utils/logger";

/**
 * 会话管理类
 */
export class ConversationManager {
  private startLabels: string[];
  private endLabels: string[];
  private isAborted: boolean = false;
  private retryCount: number = 0;

  public connections: ServerWebSocket[] = [];
  public userInput: string = "";

  // 类属性声明
  public memory!: FilePersistedMemory;
  private toolService!: ToolService;
  private llm: any;
  private conversationType!: "main" | "sub";

  static taskMapToConversationManager: Record<string, ConversationManager> = {};

  constructor(params: {
    taskId?: string;
    memory?: FilePersistedMemory;
    toolService?: ToolService;
    llm?: any;
    conversationType?: "main" | "sub";
    customPrompt?: () => string;
  }) {
    // 方式1: 从 taskId 加载
    if (params.taskId) {
      logger.info(`[ConversationManager] 从 taskId 创建: ${params.taskId}`);

      this.memory = new FilePersistedMemory(params.taskId);
      this.llm = getLlm();

      // 判断是主任务还是子任务
      this.conversationType = this.memory.getFatherTaskId ? "sub" : "main";

      // 从 memory 中读取工具名称
      const toolNames = this.memory.toolNames;
      const totalTools = BASIC_TOOLS.concat(CUSTOMED_TOOLS);
      const userCustomedTools = (toolNames
        .map((name) => totalTools.find((tool) => tool.name === name))
        .filter(Boolean) || totalTools) as ToolInterface<any>[];

      // 创建 toolService
      this.toolService = new ToolService(BASIC_TOOLS, this.conversationType === 'main' ? CUSTOMED_TOOLS : userCustomedTools);
    }
    // 方式2: 完整参数创建
    else {
      if (!params.memory || !params.toolService || !params.llm) {
        throw new Error("[ConversationManager] 缺少必要参数: memory, toolService, llm");
      }

      this.memory = params.memory;
      this.toolService = params.toolService;
      this.llm = params.llm;
      this.conversationType = params.conversationType || "main";
    }
    let systemPrompt = getSystemPrompt(this.toolService, this.conversationType);
    if (params.customPrompt) {
      systemPrompt += `\n\n=====用户自定义提示词:\n${params.customPrompt()}`;
    }
    
    // 如果是新会话，插入 systemMessage
    const isNewSession = this.memory.isNewSession();
    if (isNewSession) {
      this.memory.addMessage({
        role: "system",
        type: "system",
        content: systemPrompt,
      });
      
      // 发送更新后的会话历史列表给所有连接
      // 注意：这里需要异步处理，但构造函数不能是 async
      // 所以我们在构造函数完成后立即发送
      this.sendSessionHistoriesAfterInit();
    }

    // 初始化标签
    const { startLabels, endLabels } = this.toolService.toolNames.concat(systemReservedTags).reduce(
      (acc, cur) => {
        return {
          startLabels: [...acc.startLabels, `<${cur}>`],
          endLabels: [...acc.endLabels, `</${cur}>`],
        };
      },
      { startLabels: [] as string[], endLabels: [] as string[] },
    );

    ConversationManager.taskMapToConversationManager[this.memory.currentTaskId] = this;
    this.startLabels = startLabels;
    this.endLabels = endLabels;
    this.start();
  }

  /**
   * 获取会话状态（从 memory 中读取）
   */
  get conversationStatus(): ConversationStatus {
    return this.memory.conversationStatus;
  }

  /**
   * 设置会话状态（同步到 memory 并持久化）
   */
  set conversationStatus(status: ConversationStatus) {
    this.memory.conversationStatus = status;
  }

  /**
   * 判断是否是新会话
   */
  public isNewSession(): boolean {
    return this.memory.isNewSession();
  }
  
  /**
   * 在初始化后发送会话历史列表
   */
  private async sendSessionHistoriesAfterInit() {
    // 使用 setTimeout 确保在构造函数完成后执行
    setTimeout(async () => {
      const { getSessionHistories } = await import("@/utils/getSessions");
      const sessionHistories = await getSessionHistories();
      
      this.emitMessage({
        type: "sessionHistories",
        data: {
          sessionHistories,
        },
      });
      
      logger.info(`[ConversationManager] Sent session histories for new session: ${this.memory.currentTaskId}`);
    }, 0);
  }
  
  public addConnection(ws: ServerWebSocket) {
    this.connections.push(ws);
  }
  public removeConnection(ws: ServerWebSocket) {
    const index = this.connections.indexOf(ws);
    this.connections.splice(index, 1);
  }
  /**
   * 发送消息给该 task 下所有 socket
   * @param 要发送的消息, 类型为 WebSocketMessage<T>
   */
  public emitMessage = <T extends SERVER_SEND_MESSAGE_NAME>({
    type,
    data,
  }: WebSocketMessage<T>) => {
    this.connections.forEach((ws) => {
      ws.send(
        JSON.stringify({
          type,
          data: { ...data, updateTime: (data as any).updateTime || Date.now() },
        } as WebSocketMessage<T>),
      );
    });
  };
  /**
   * 开始会话
   * @param initialMessage 初始消息
   */
  private async start() {
    await pWaitFor(() => !!this.userInput);
    this.conversationStatus = "streaming";
    this._handleStream();
  }

  /**
   * 接受用户新输入
   * @param input 用户输入
   */
  public setUserInput(message: WebSocketMessage<"userSendMessage">) {
    this.userInput = message.data.message;
    this.isAborted = false;
    this.memory.addMessage({
      role: "user",
      content: this.userInput,
      type: "userSendMessage",
      partial: false,
    });
    this.memory.addWebsocketMessage(message);
  }

  // 处理流式响应并解析工具调用
  private async _handleStream(): Promise<void> {
    const controller = new AbortController();
    const { signal } = controller;

    try {
      // 直接使用 memory 中的 messages，system prompt 已经在构造函数中添加
      const stream = await this.llm.stream(this.memory.messages, {
        signal,
      });
      const currentTool = await parseStreamingXml({
        stream,
        startLabels: this.startLabels,
        onPartialMessageFound: async (message) => {
          this._postMessage({
            role: "assistant",
            content: message,
            type: "message",
            partial: true,
          });
        },
        onMessageLeft: async (message) => {
          if (!isWhitespaceOnly(message)) {
            this._postMessage({
              role: "assistant",
              content: message,
              type: "message",
              partial: false,
            });
          }
        },
        onCommonMessageFound: async (message: string) => {
          this._postMessage({
            role: "assistant",
            content: message,
            type: "message",
            partial: false,
          });
        },
        onFullToolCallFound: async (fullToolCall, currentTool, currentType) => {
          this.conversationStatus = "tool_executing";
          // 确保有 partial 输出
          this._postMessage({
            role: "assistant",
            content: JSON.stringify({
              params: this.toolService.parseParams(fullToolCall).params,
              toolName: currentTool,
            } as TransportToolContent<any>),
            originalMessage: fullToolCall,
            type: currentType,
            partial: true,
          });
          const { toolResult, message, params } = await this.toolService.parseAndExecute({
            xmlParams: fullToolCall,
            getCurrentTask: () => this.memory.currentTaskId,
          });
          this._postMessage({
            role: "assistant",
            content: JSON.stringify({
              result: toolResult,
              params,
              toolName: currentTool,
            } as TransportToolContent<any>),
            originalMessage: fullToolCall,
            type: currentType,
            partial: false,
          });
          this.memory.addMessage({
            role: "system",
            content: `当前工具调用：${currentTool}，\n工具执行信息：\n${message}\n`,
            type: currentType,
            partial: false,
          });
        },
        onPartialToolCallFound: async (partialToolCall, currentTool, currentType) => {
          // 正在输出参数, 采用最大化解析的办法, 先输出 partial 的工具调用
          const { params } = this.toolService.parseParams(partialToolCall, true);
          this._postMessage({
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
        },
        checkShouldAbort: async () => this.isAborted,
      });
      switch (currentTool) {
        case "interrupt":
          logger.info("\n会话已通过打断信号结束。");
          this.conversationStatus = "aborted";
          this.userInput = "";
          await pWaitFor(() => !!this.userInput);
          break;
        case "completionResult":
          logger.info("\n对话已完成。");
          this.conversationStatus = "completed";
          if (this.conversationType !== "main") {
            return;
          }
          this.userInput = "";
          await pWaitFor(() => !!this.userInput);
          break;
        case "askFollowupQuestion":
          this.userInput = "";
          await pWaitFor(() => !!this.userInput);
          break;
        case "message":
          // 惩罚机制：如果 LLM 只输出普通消息而没有调用工具或结束任务
          // 添加系统提示并自动继续执行
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
          this.conversationStatus = "idle";
          break;
        default:
          this.conversationStatus = "idle";
      }
      this._handleStream();
    } catch (error: any) {
      logger.error("流式响应过程中出现错误:", error);
      this.emitMessage({
        type: "error",
        data: {
          message: "处理您的请求时发生错误，请重试。",
          details: error.message,
        },
      });
      this.conversationStatus = "error";
      this.userInput = ""; // 重置输入，等待下一次用户交互
    }
  }

  /**
   * 发送消息，并保存
   */
  private _postMessage(message: ChatMessage & { originalMessage?: string }) {
    // 1. 避免模型有时候输出空白字符
    // 2. 避免在 abort 后会发送残留信息
    if (
      (isWhitespaceOnly(message.originalMessage) && isWhitespaceOnly(message.content)) ||
      this.isAborted
    ) {
      return;
    }
    this.memory.addMessage({ ...message, content: message.originalMessage || message.content });
    const lastMessage = this.memory.lastMessage!;
    const requestBody = {
      type: message.type as SERVER_SEND_MESSAGE_NAME,
      data: {
        message: message.content,
        partial: message.partial || false,
        updateTime: lastMessage.updateTime,
        taskId: this.memory.currentTaskId,
      },
    };
    this.emitMessage(requestBody);
    this.memory.addWebsocketMessage(requestBody);
  }

  /**
   * 打断会话
   */
  public interrupt() {
    logger.info("会话已被打断。");
    this.isAborted = true;
    this.memory.addMessage({
      role: "assistant",
      content: "用户已打断会话。",
      type: "interrupt",
      partial: false,
    });
    const interruptMessage = {
      type: "interrupt" as const,
      data: {
        taskId: this.memory.currentTaskId,
        updateTime: Date.now().valueOf(),
      },
    };
    // 只存储到历史记录，不发送给前端
    // 前端点击中断后按钮状态已经改变，不需要服务端确认
    this.memory.addWebsocketMessage(interruptMessage);

    // 递归打断所有子任务
    const currentTaskId = this.memory.currentTaskId;
    const managers = Object.values(ConversationManager.taskMapToConversationManager);
    for (const manager of managers) {
      // 子任务的 memory.parentTaskId 等于当前 taskId
      if (
        manager !== this &&
        (manager.memory as any).parentTaskId === currentTaskId &&
        manager.conversationStatus !== "aborted" &&
        manager.conversationStatus !== "completed"
      ) {
        manager.interrupt();
      }
    }
  }

  /**
   * 加载指定任务的 memory，切换到该任务
   */
  public loadMemories(taskId: string): boolean {
    if(this.memory.currentTaskId === taskId && ConversationManager.taskMapToConversationManager[taskId]) {
      logger.info(`[ConversationManager] 当前任务已存在，无需切换: ${taskId}`)
      return true;
    }
    try {
      logger.info(`[ConversationManager] 切换到任务: ${taskId}`);

      // 重新注册到 taskMapToConversationManager
      ConversationManager.taskMapToConversationManager[taskId] = new ConversationManager({
        taskId,
      });

      logger.info(`[ConversationManager] 成功切换到任务 ${taskId}`);
      return true;
    } catch (error) {
      logger.error(`[ConversationManager] 切换任务失败:`, error);
      return false;
    }
  }

  /**
   * 恢复会话
   */
  public resume() {
    logger.info("会话已恢复。");
    // 重置中断状态
    this.isAborted = false;
    this.conversationStatus = "streaming";

    // 设置用户输入，触发对话继续
    this.userInput = "请继续完成之前被中断的任务。";
  }

  /**
   * 静态方法：创建并运行子会话，返回最终消息
   */
  static async runSubConversation(props: {
    subPrompt: string;
    target: string;
    parentTaskId: string;
    tools: ToolInterface<any>[];
    index?: number; // 新增 index 参数
  }): Promise<ChatMessage> {
    const { subPrompt, parentTaskId, tools, target, index = 0 } = props;
    const llm = getLlm();
    const subTaskId = uuidV4();
    const toolService = new ToolService(BASIC_TOOLS, tools);
    const subMemory = new FilePersistedMemory(subTaskId, parentTaskId);

    // 保存用户自定义工具名称，用于后续恢复
    const toolNames = tools.map((t) => t.name);
    subMemory.setToolNames(toolNames);

    const subManager = new ConversationManager({
      memory: subMemory,
      toolService,
      llm,
      conversationType: "sub",
      customPrompt: () => subPrompt,
    });

    // 触发子会话输入
    subManager.setUserInput({
      type: "userSendMessage",
      data: { message: target },
    } as any);
    const parentConversationManager =
      ConversationManager.taskMapToConversationManager[parentTaskId];
    if (!parentConversationManager) {
      throw new Error(`未找到父会话管理器，父任务ID：${parentTaskId}`);
    }
    // 发送子任务创建消息
    const createdMessage = {
      type: "assignTaskUpdated" as SERVER_SEND_MESSAGE_NAME,
      data: {
        index,
        taskId: subTaskId,
        parentTaskId,
        taskStatus: "running" as const,
      },
    };
    parentConversationManager.memory.addWebsocketMessage(createdMessage);
    parentConversationManager.emitMessage(createdMessage);

    // 等待子任务完成
    await pWaitFor(() => subManager.conversationStatus === "completed", {
      timeout: 30 * 60 * 1000,
    });
    logger.info(`子会话 ${subTaskId} 已完成。`, subManager.conversationStatus === "completed");

    // 发送子任务完成消息
    const completedMessage = {
      type: "assignTaskUpdated" as SERVER_SEND_MESSAGE_NAME,
      data: {
        index,
        taskId: subTaskId,
        parentTaskId,
        taskStatus: "completed" as const,
      },
    };
    parentConversationManager.memory.addWebsocketMessage(completedMessage);
    parentConversationManager.emitMessage(completedMessage);

    return subManager.memory.lastMessage!;
  }
}
