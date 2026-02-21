import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type ChatMessage,
  type ConversationStatus,
  type PendingToolCall,
  type SERVER_SEND_MESSAGE_NAME,
  StorageType,
  type TaskStatusMetadata,
  type USER_SEND_MESSAGE_NAME,
  type WebSocketMessage,
} from "@amigo-llm/types";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";

/**
 * 文件持久化内存管理类
 * 精简版本，直接存储OpenAI API兼容格式
 */
export class FilePersistedMemory {
  private _messages: ChatMessage[] = [];
  private _websocketMessages: WebSocketMessage<any>[] = [];
  private _conversationStatus: ConversationStatus = "idle";
  private _toolNames: string[] = [];
  private _pendingToolCall: PendingToolCall | null = null;
  private _createdAt: string;

  constructor(
    private taskId: string,
    private fatherTaskId?: string,
  ) {
    this._createdAt = new Date().toISOString();
    this.loadTaskStatus();
    this.loadOriginalFromFile();
    this.loadWebsocketFromFile();
  }

  /**
   * 检查任务是否存在于磁盘（通过检查 original.json 文件）
   */
  static exists(taskId: string): boolean {
    const storagePath = path.join(getGlobalState("globalStoragePath") || process.cwd(), taskId);
    const originalPath = path.join(storagePath, "messages", `${StorageType.ORIGINAL}.json`);
    return existsSync(originalPath);
  }

  /**
   * 获取当前存储路径
   */
  get storagePath() {
    return path.join(getGlobalState("globalStoragePath") || process.cwd(), this.taskId);
  }

  /**
   * 获取消息存储路径
   */
  get messagesPath() {
    return path.join(this.storagePath, "messages");
  }

  /**
   * 获取任务文档存储路径
   */
  get taskDocsPath() {
    return path.join(this.storagePath, "taskDocs");
  }

  /**
   * 获取任务状态文件路径
   */
  get taskStatusPath() {
    return path.join(this.storagePath, `${StorageType.TASK_STATUS}.json`);
  }

  /**
   * 当前 taskId
   */
  get currentTaskId() {
    return this.taskId;
  }
  /**
   * 父记录 taskId
   */
  public get getFatherTaskId(): string | undefined {
    return this.fatherTaskId;
  }

  /**
   * 获取会话状态
   */
  get conversationStatus(): ConversationStatus {
    return this._conversationStatus;
  }

  /**
   * 设置会话状态并持久化
   */
  set conversationStatus(status: ConversationStatus) {
    this._conversationStatus = status;
    this.saveTaskStatus();
  }

  private ensureDirectoryExists(directory: string): void {
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
  }

  /**
   * 加载任务状态元数据
   */
  private loadTaskStatus(): void {
    if (existsSync(this.taskStatusPath)) {
      try {
        const data: TaskStatusMetadata = JSON.parse(readFileSync(this.taskStatusPath, "utf-8"));
        this._conversationStatus = data.conversationStatus || "idle";
        this._toolNames = data.toolNames || [];
        this._pendingToolCall = data.pendingToolCall || null;
        this._createdAt = data.createdAt || new Date().toISOString();
        if (data.fatherTaskId) {
          this.fatherTaskId = data.fatherTaskId;
        }
      } catch (error) {
        logger.error(`加载任务状态失败: ${error}`);
      }
    }
  }

  /**
   * 保存任务状态元数据
   */
  private saveTaskStatus(): boolean {
    try {
      this.ensureDirectoryExists(this.storagePath);
      const metadata: TaskStatusMetadata = {
        taskId: this.taskId,
        fatherTaskId: this.fatherTaskId,
        conversationStatus: this._conversationStatus,
        toolNames: this._toolNames,
        pendingToolCall: this._pendingToolCall || undefined,
        createdAt: this._createdAt,
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(this.taskStatusPath, JSON.stringify(metadata, null, 2), "utf-8");
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`保存任务状态失败: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 获取待确认的工具调用
   */
  public get pendingToolCall(): PendingToolCall | null {
    return this._pendingToolCall;
  }

  /**
   * 设置待确认的工具调用
   */
  public setPendingToolCall(toolCall: PendingToolCall | null): void {
    this._pendingToolCall = toolCall;
    this.saveTaskStatus();
  }

  private loadOriginalFromFile(): void {
    const targetPath = path.join(this.messagesPath, `${StorageType.ORIGINAL}.json`);
    if (existsSync(targetPath)) {
      try {
        const data = JSON.parse(readFileSync(targetPath, "utf-8"));
        if (Array.isArray(data.messages)) {
          this._messages = data.messages;
        }
      } catch (error) {
        logger.error(`加载原始消息历史失败: ${error}`);
      }
    }
  }

  /**
   * 判断是否是新会话（文件不存在或 messages 为空）
   */
  public isNewSession(): boolean {
    const targetPath = path.join(this.messagesPath, `${StorageType.ORIGINAL}.json`);
    if (!existsSync(targetPath)) {
      return true;
    }
    // 文件存在但 messages 为空也认为是新会话
    return this._messages.length === 0;
  }

  private loadWebsocketFromFile(): void {
    const targetPath = path.join(this.messagesPath, `${StorageType.FRONT_END}.json`);
    if (existsSync(targetPath)) {
      try {
        const data = JSON.parse(readFileSync(targetPath, "utf-8"));
        if (Array.isArray(data.messages)) {
          this._websocketMessages = data.messages;
        }
      } catch (error) {
        logger.error(`加载WebSocket消息历史失败: ${error}`);
      }
    }
  }

  /**
   * 直接获取原始消息列表 (OpenAI API所需格式)
   */
  public get messages(): ChatMessage[] {
    return [...this._messages];
  }

  /**
   * 获取发送给前端的消息列表
   */
  public getWebsocketMessages(): WebSocketMessage<any>[] {
    return [...this._websocketMessages];
  }

  /**
   * 获取最近一条原始信息
   */
  public get lastMessage(): ChatMessage | undefined {
    return this._messages.at(-1);
  }
  /**
   * 获取最近一条frontend信息
   */
  public get lastWebsocketMessage(): WebSocketMessage<any> | undefined {
    return this._websocketMessages.at(-1);
  }
  /**
   * 判断是否是 partial message
   * @param message
   * @returns
   */
  private isOverwritePrevMessage(message: ChatMessage) {
    const lastMessage = this.lastMessage;
    const isOverwriteLastMessage =
      lastMessage?.partial &&
      lastMessage.role === message.role &&
      message.type === lastMessage.type;
    return isOverwriteLastMessage;
  }

  /**
   * 增加新消息，可处理普通消息和流式消息
   * @param message 消息对象
   */
  public addMessage(message: ChatMessage) {
    // 检查最后一条消息是否是未完成的流式消息，并且消息类型相同为 message
    if (this.isOverwritePrevMessage(message)) {
      this._messages[this._messages.length - 1] = {
        ...message,
        updateTime: this.lastMessage?.updateTime,
      };
    } else {
      this._messages.push({ ...message, updateTime: Date.now() });
    }
    this.saveOriginalToFile();
  }

  public addWebsocketMessage<K extends USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME>(
    message: WebSocketMessage<K>,
  ) {
    const lastWebsocketMessage = this._websocketMessages.at(-1);
    const isUpdatePrevWebsocketMessage =
      lastWebsocketMessage?.data.partial && message.type === lastWebsocketMessage?.type;
    if (isUpdatePrevWebsocketMessage) {
      this._websocketMessages[this._websocketMessages.length - 1] = message;
    } else {
      this._websocketMessages.push(message);
    }
    this.saveWebsocketToFile();
  }

  /**
   * 设置工具名称列表
   */
  public setToolNames(toolNames: string[]) {
    this._toolNames = toolNames;
    this.saveTaskStatus();
  }

  /**
   * 获取工具名称列表
   */
  public get toolNames(): string[] {
    return this._toolNames;
  }

  /**
   * 保存原始历史到文件（只保存消息数组）
   */
  public saveOriginalToFile(): boolean {
    try {
      this.ensureDirectoryExists(this.messagesPath);
      const data = {
        messages: this._messages,
        updatedAt: new Date().toISOString(),
      };
      const realMessageStoragePath = path.join(this.messagesPath, `${StorageType.ORIGINAL}.json`);
      writeFileSync(realMessageStoragePath, JSON.stringify(data, null, 2), "utf-8");
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`保存原始历史记录失败: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 保存WebSocket消息到文件（只保存消息数组）
   */
  private saveWebsocketToFile(): boolean {
    try {
      this.ensureDirectoryExists(this.messagesPath);
      const data = {
        messages: this._websocketMessages,
        updatedAt: new Date().toISOString(),
      };
      const websocketMessageStoragePath = path.join(
        this.messagesPath,
        `${StorageType.FRONT_END}.json`,
      );
      writeFileSync(websocketMessageStoragePath, JSON.stringify(data, null, 2), "utf-8");
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`保存WebSocket消息历史失败: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 清空历史
   */
  public clearHistory(): boolean {
    this._messages = [];
    this._websocketMessages = []; // 同时清空WebSocket消息
    // 将两个文件都清空
    return this.saveOriginalToFile() && this.saveWebsocketToFile();
  }

  /**
   * 删除会话的所有存储文件
   */
  public async delete(): Promise<void> {
    const { rmSync } = await import("node:fs");
    if (existsSync(this.storagePath)) {
      rmSync(this.storagePath, { recursive: true, force: true });
      logger.info(`[Memory] 已删除存储目录: ${this.storagePath}`);
    }
  }
}
