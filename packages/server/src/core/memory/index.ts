import { getGlobalState } from "@/globalState";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type ChatMessage,
  StorageType,
  type USER_SEND_MESSAGE_NAME,
  type WebSocketMessage,
} from "@amigo/types";

/**
 * 文件持久化内存管理类
 * 精简版本，直接存储OpenAI API兼容格式
 */
export class FilePersistedMemory {
  private _messages: ChatMessage[] = [];
  private _websocketMessages: WebSocketMessage<any>[] = [];

  constructor(
    private taskId: string,
    private fatherTaskId?: string,
  ) {
    this.loadOriginalFromFile();
    this.loadWebsocketFromFile();
  }

  /**
   * 获取当前存储路径
   */
  get storagePath() {
    return path.join(getGlobalState("globalStoragePath") || process.cwd(), this.taskId);
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
  private ensureDirectoryExists(directory: string): void {
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
  }

  private loadOriginalFromFile(): void {
    const targetPath = path.join(this.storagePath, `${StorageType.ORIGINAL}.json`);
    if (existsSync(targetPath)) {
      try {
        const data = JSON.parse(readFileSync(targetPath, "utf-8"));
        if (Array.isArray(data.messages)) {
          this._messages = data.messages;
        }
      } catch (error) {
        console.error(`加载原始消息历史失败: ${error}`);
      }
    }
  }

  private loadWebsocketFromFile(): void {
    const targetPath = path.join(this.storagePath, `${StorageType.FRONT_END}.json`);
    if (existsSync(targetPath)) {
      try {
        const data = JSON.parse(readFileSync(targetPath, "utf-8"));
        if (Array.isArray(data.messages)) {
          this._websocketMessages = data.messages;
        }
      } catch (error) {
        console.error(`加载WebSocket消息历史失败: ${error}`);
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

  public addWebsocketMessage<K extends USER_SEND_MESSAGE_NAME>(message: WebSocketMessage<K>) {
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
   * 保存原始历史到文件
   */
  public saveOriginalToFile(): boolean {
    try {
      this.ensureDirectoryExists(this.storagePath);
      const data = {
        messages: this._messages,
        updatedAt: new Date().toISOString(),
        taskId: this.taskId,
        fatherTaskId: this.fatherTaskId
      };
      const realMessageStoragePath = path.join(this.storagePath, `${StorageType.ORIGINAL}.json`);
      writeFileSync(realMessageStoragePath, JSON.stringify(data, null, 2), "utf-8");
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`保存原始历史记录失败: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 保存WebSocket消息到文件
   */
  private saveWebsocketToFile(): boolean {
    try {
      this.ensureDirectoryExists(this.storagePath);
      const data = {
        messages: this._websocketMessages,
        updatedAt: new Date().toISOString(),
        taskId: this.taskId,
      };
      const websocketMessageStoragePath = path.join(
        this.storagePath,
        `${StorageType.FRONT_END}.json`,
      );
      writeFileSync(websocketMessageStoragePath, JSON.stringify(data, null, 2), "utf-8");
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`保存WebSocket消息历史失败: ${errorMessage}`);
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
}
