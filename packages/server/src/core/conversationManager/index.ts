import type {
  ChatMessage,
  ConversationStatus,
  SERVER_SEND_MESSAGE_NAME,
  ToolInterface,
  WebSocketMessage,
} from "@amigo/types";
import type { ServerWebSocket } from "bun";
import pWaitFor from "p-wait-for";
import { systemReservedTags } from "@amigo/types";
import { FilePersistedMemory } from "../memory";
import { getLlm } from "../model";
import { getSystemPrompt } from "../systemPrompt";
import { BASIC_TOOLS, CUSTOMED_TOOLS, ToolService } from "../tools";
import { v4 as uuidV4 } from "uuid";
import { logger } from "@/utils/logger";
import { MessageEmitter } from "./MessageEmitter";
import { ToolExecutor } from "./ToolExecutor";
import { ErrorHandler } from "./ErrorHandler";
import { StreamHandler } from "./StreamHandler";

/**
 * 会话管理类 - 主控制器
 */
export class ConversationManager {
  private startLabels: string[];
  private endLabels: string[];
  private isAborted: boolean = false;

  public connections: ServerWebSocket[] = [];
  public userInput: string = "";

  // 类属性声明
  public memory!: FilePersistedMemory;
  private toolService!: ToolService;
  private llm: any;
  private conversationType!: "main" | "sub";

  // 各个管理器
  private messageEmitter!: MessageEmitter;
  private toolExecutor!: ToolExecutor;
  private errorHandler!: ErrorHandler;
  private streamHandler!: StreamHandler;

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
      this.toolService = new ToolService(
        BASIC_TOOLS,
        this.conversationType === "main" ? CUSTOMED_TOOLS : userCustomedTools
      );
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

      this.sendSessionHistoriesAfterInit();
    }

    // 初始化标签
    const { startLabels, endLabels } = this.toolService.toolNames
      .concat(systemReservedTags)
      .reduce(
        (acc, cur) => {
          return {
            startLabels: [...acc.startLabels, `<${cur}>`],
            endLabels: [...acc.endLabels, `</${cur}>`],
          };
        },
        { startLabels: [] as string[], endLabels: [] as string[] }
      );

    ConversationManager.taskMapToConversationManager[this.memory.currentTaskId] = this;
    this.startLabels = startLabels;
    this.endLabels = endLabels;

    // 初始化各个管理器
    this.initializeManagers();

    this.start();
  }

  /**
   * 初始化各个管理器
   */
  private initializeManagers(): void {
    this.messageEmitter = new MessageEmitter({
      memory: this.memory,
      getConnections: () => this.connections,
      isAborted: () => this.isAborted,
    });

    this.toolExecutor = new ToolExecutor({
      toolService: this.toolService,
      messageEmitter: this.messageEmitter,
      memory: this.memory,
    });

    this.errorHandler = new ErrorHandler({
      messageEmitter: this.messageEmitter,
      getUserInput: () => this.userInput,
      setUserInput: (input) => (this.userInput = input),
      setConversationStatus: (status) => (this.conversationStatus = status),
    });

    this.streamHandler = new StreamHandler({
      llm: this.llm,
      memory: this.memory,
      messageEmitter: this.messageEmitter,
      toolExecutor: this.toolExecutor,
      errorHandler: this.errorHandler,
      startLabels: this.startLabels,
      conversationType: this.conversationType,
      getUserInput: () => this.userInput,
      setUserInput: (input) => (this.userInput = input),
      getConversationStatus: () => this.conversationStatus,
      setConversationStatus: (status) => (this.conversationStatus = status),
      isAborted: () => this.isAborted,
    });
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
    setTimeout(async () => {
      const { getSessionHistories } = await import("@/utils/getSessions");
      const sessionHistories = await getSessionHistories();
      this.emitMessage({
        type: "sessionHistories",
        data: {
          sessionHistories,
        },
      });
      logger.info(
        `[ConversationManager] Sent session histories for new session: ${this.memory.currentTaskId}`
      );
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
   */
  public emitMessage<T extends SERVER_SEND_MESSAGE_NAME>(message: WebSocketMessage<T>): void {
    this.messageEmitter.emitMessage(message);
  }

  /**
   * 开始会话
   */
  private async start() {
    await pWaitFor(() => !!this.userInput);
    this.conversationStatus = "streaming";
    this.streamHandler.handleStream();
  }

  /**
   * 接受用户新输入
   */
  public setUserInput(message: WebSocketMessage<"userSendMessage">) {
    logger.info(
      `[ConversationManager] setUserInput - taskId: ${this.memory.currentTaskId}, message: ${message.data.message}, conversationType: ${this.conversationType}`
    );
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

  /**
   * 打断会话
   */
  public interrupt() {
    logger.info("会话已被打断。");
    this.isAborted = true;

    // 立即中断当前的 LLM 请求
    const controller = this.streamHandler.getCurrentAbortController();
    if (controller) {
      controller.abort();
      this.streamHandler.clearAbortController();
    }

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

    this.memory.addWebsocketMessage(interruptMessage);
    
    // 发送 interrupt 消息到前端
    this.emitMessage(interruptMessage);

    // 设置状态为 idle 并清空用户输入
    this.conversationStatus = "idle";
    this.userInput = "";

    // 发送 conversationOver 消息
    this.emitMessage({
      type: "conversationOver",
      data: { reason: "interrupt" },
    });

    // 递归打断所有子任务
    const currentTaskId = this.memory.currentTaskId;
    const managers = Object.values(ConversationManager.taskMapToConversationManager);
    for (const manager of managers) {
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
    if (
      this.memory.currentTaskId === taskId &&
      ConversationManager.taskMapToConversationManager[taskId]
    ) {
      logger.info(`[ConversationManager] 当前任务已存在，无需切换: ${taskId}`);
      return true;
    }

    try {
      logger.info(`[ConversationManager] 切换到任务: ${taskId}`);
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
    this.isAborted = false;
    this.conversationStatus = "streaming";
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
    index?: number;
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
