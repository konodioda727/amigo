import path from "node:path";
import {
  type ChatMessage,
  type ContextUsageStatus,
  type ConversationStatus,
  type PendingToolCall,
  type SERVER_SEND_MESSAGE_NAME,
  StorageType,
  type SubTaskStatus,
  type USER_SEND_MESSAGE_NAME,
  type WebSocketMessage,
} from "@amigo-llm/types";
import { getConversationPersistenceProvider } from "@/core/persistence";
import type { ConversationPersistenceRecord } from "@/core/persistence/types";
import { getTaskStoragePath } from "@/core/storage";
import type { ResolvedModelConfig } from "../model/contextConfig";

/**
 * 文件持久化内存管理类
 *
 * 保持既有 API 不变，但读写统一委托给 backend 内部 persistence provider。
 */
export class FilePersistedMemory {
  private _messages: ChatMessage[] = [];
  private _websocketMessages: WebSocketMessage<
    USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME
  >[] = [];
  private _conversationStatus: ConversationStatus = "idle";
  private _initialSystemPrompt?: string;
  private _toolNames: string[] = [];
  private _context: unknown;
  private _modelConfigSnapshot?: ResolvedModelConfig;
  private _autoApproveToolNames: string[] = [];
  private _pendingToolCall: PendingToolCall | null = null;
  private _subTasks: Record<string, SubTaskStatus> = {};
  private _contextUsage?: ContextUsageStatus;
  private _createdAt: string;
  private _hasPersistedState = false;
  private readonly persistenceProvider = getConversationPersistenceProvider();

  constructor(
    private taskId: string,
    private fatherTaskId?: string,
  ) {
    this._createdAt = new Date().toISOString();
    this.loadFromPersistence();
  }

  /**
   * 检查任务是否存在
   */
  static exists(taskId: string): boolean {
    return getConversationPersistenceProvider().exists(taskId);
  }

  /**
   * 获取当前存储路径
   */
  get storagePath() {
    return getTaskStoragePath(this.taskId);
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

  get initialSystemPrompt(): string | undefined {
    return this._initialSystemPrompt;
  }

  /**
   * 设置会话状态并持久化
   */
  set conversationStatus(status: ConversationStatus) {
    this._conversationStatus = status;
    this.saveTaskStatus();
  }

  /**
   * 获取待确认的工具调用
   */
  public get pendingToolCall(): PendingToolCall | null {
    return this._pendingToolCall;
  }

  /**
   * 获取原始消息列表
   */
  public get messages(): ChatMessage[] {
    return [...this._messages];
  }

  /**
   * 获取发送给前端的消息列表
   */
  public getWebsocketMessages(): WebSocketMessage<
    USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME
  >[] {
    return [...this._websocketMessages];
  }

  /**
   * 获取最近一条原始信息
   */
  public get lastMessage(): ChatMessage | undefined {
    return this._messages.at(-1);
  }

  /**
   * 获取最近一条 frontend 信息
   */
  public get lastWebsocketMessage():
    | WebSocketMessage<USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME>
    | undefined {
    return this._websocketMessages.at(-1);
  }

  /**
   * 判断是否覆盖上一条流式消息
   */
  private isOverwritePrevMessage(message: ChatMessage): boolean {
    const lastMessage = this.lastMessage;
    const isOverwriteLastMessage =
      lastMessage?.partial &&
      lastMessage.role === message.role &&
      message.type === lastMessage.type;
    return !!isOverwriteLastMessage;
  }

  private applyPersistenceRecord(record: ConversationPersistenceRecord): void {
    const firstMessage = record.messages[0];
    const legacyInitialSystemPrompt =
      record.initialSystemPrompt ||
      (firstMessage?.role === "system" && firstMessage.type === "system"
        ? firstMessage.content
        : undefined);
    this._initialSystemPrompt = legacyInitialSystemPrompt;
    this._messages =
      legacyInitialSystemPrompt && firstMessage?.role === "system" && firstMessage.type === "system"
        ? [...record.messages.slice(1)]
        : [...record.messages];
    this._websocketMessages = [...record.websocketMessages];
    this._conversationStatus = record.conversationStatus;
    this._toolNames = [...record.toolNames];
    this._context = record.context;
    this._modelConfigSnapshot = record.modelConfigSnapshot;
    this._autoApproveToolNames = [...record.autoApproveToolNames];
    this._pendingToolCall = record.pendingToolCall;
    this._subTasks = { ...record.subTasks };
    this._contextUsage = record.contextUsage;
    this._createdAt = record.createdAt;
    this.fatherTaskId = record.fatherTaskId;
    this._hasPersistedState = true;
  }

  private loadFromPersistence(): void {
    const record = this.persistenceProvider.load(this.taskId);
    if (record) {
      this.applyPersistenceRecord(record);
      return;
    }

    if (this.fatherTaskId) {
      this._hasPersistedState = false;
    }
  }

  private buildPersistenceRecord(): ConversationPersistenceRecord {
    return {
      taskId: this.taskId,
      fatherTaskId: this.fatherTaskId,
      conversationStatus: this._conversationStatus,
      initialSystemPrompt: this._initialSystemPrompt,
      toolNames: [...this._toolNames],
      context: this._context,
      modelConfigSnapshot: this._modelConfigSnapshot,
      autoApproveToolNames: [...this._autoApproveToolNames],
      pendingToolCall: this._pendingToolCall,
      subTasks: { ...this._subTasks },
      contextUsage: this._contextUsage,
      createdAt: this._createdAt,
      updatedAt: new Date().toISOString(),
      messages: [...this._messages],
      websocketMessages: [...this._websocketMessages],
    };
  }

  private persist(): boolean {
    const saved = this.persistenceProvider.save(this.buildPersistenceRecord());
    if (saved) {
      this._hasPersistedState = true;
    }
    return saved;
  }

  /**
   * 保存任务状态元数据
   */
  private saveTaskStatus(): boolean {
    return this.persist();
  }

  /**
   * 判断是否是新会话
   */
  public isNewSession(): boolean {
    if (!this._hasPersistedState) {
      return true;
    }
    return this._messages.length === 0 && !this._initialSystemPrompt;
  }

  public setInitialSystemPrompt(prompt: string): void {
    const normalizedPrompt = prompt.trim();
    this._initialSystemPrompt = normalizedPrompt || undefined;
    this.saveTaskStatus();
  }

  /**
   * 设置待确认的工具调用
   */
  public setPendingToolCall(toolCall: PendingToolCall | null): void {
    this._pendingToolCall = toolCall;
    this.saveTaskStatus();
  }

  /**
   * 增加新消息，可处理普通消息和流式消息
   */
  public addMessage(message: ChatMessage): void {
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

  public insertMessageAt(index: number, message: ChatMessage): ChatMessage {
    const safeIndex = Math.max(0, Math.min(index, this._messages.length));
    const nextMessage = { ...message, updateTime: Date.now() };
    this._messages.splice(safeIndex, 0, nextMessage);
    this.saveOriginalToFile();
    return nextMessage;
  }

  public addWebsocketMessage<K extends USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME>(
    message: WebSocketMessage<K>,
  ): void {
    const lastWebsocketMessage = this._websocketMessages.at(-1);
    const isUpdatePrevWebsocketMessage =
      lastWebsocketMessage?.data.partial && message.type === lastWebsocketMessage?.type;
    if (isUpdatePrevWebsocketMessage) {
      this._websocketMessages[this._websocketMessages.length - 1] =
        message as unknown as WebSocketMessage<USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME>;
    } else {
      this._websocketMessages.push(
        message as unknown as WebSocketMessage<USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME>,
      );
    }
    this.saveWebsocketToFile();
  }

  /**
   * 设置工具名称列表
   */
  public setToolNames(toolNames: string[]): void {
    this._toolNames = [...toolNames];
    this.saveTaskStatus();
  }

  public get context(): unknown {
    return this._context;
  }

  public setContext(context: unknown): void {
    this._context = context;
    this.saveTaskStatus();
  }

  public get modelConfigSnapshot(): ResolvedModelConfig | undefined {
    return this._modelConfigSnapshot;
  }

  public setModelConfigSnapshot(modelConfigSnapshot: ResolvedModelConfig | undefined): void {
    this._modelConfigSnapshot = modelConfigSnapshot;
    this.saveTaskStatus();
  }

  /**
   * 获取工具名称列表
   */
  public get toolNames(): string[] {
    return [...this._toolNames];
  }

  /**
   * 设置自动批准工具名称列表
   */
  public setAutoApproveToolNames(toolNames: string[]): void {
    this._autoApproveToolNames = Array.from(
      new Set(toolNames.map((name) => name.trim()).filter(Boolean)),
    );
    this.saveTaskStatus();
  }

  /**
   * 获取自动批准工具名称列表
   */
  public get autoApproveToolNames(): string[] {
    return [...this._autoApproveToolNames];
  }

  /**
   * 获取子任务状态列表
   */
  public get subTasks(): Record<string, SubTaskStatus> {
    return { ...this._subTasks };
  }

  public get contextUsage(): ContextUsageStatus | undefined {
    return this._contextUsage;
  }

  public setContextUsage(contextUsage: ContextUsageStatus | undefined): void {
    this._contextUsage = contextUsage;
    this.saveTaskStatus();
  }

  /**
   * 更新子任务状态
   */
  public updateSubTask(description: string, status: SubTaskStatus): void {
    const prev = this._subTasks[description] || {};
    this._subTasks[description] = { ...prev, ...status };
    this.saveTaskStatus();
  }

  /**
   * 获取子任务状态
   */
  public getSubTask(description: string): SubTaskStatus | undefined {
    return this._subTasks[description];
  }

  /**
   * 清理子任务状态
   */
  public clearSubTask(description: string): void {
    delete this._subTasks[description];
    this.saveTaskStatus();
  }

  /**
   * 清理所有子任务状态
   */
  public clearAllSubTasks(): void {
    this._subTasks = {};
    this.saveTaskStatus();
  }

  /**
   * 保存原始历史
   */
  public saveOriginalToFile(): boolean {
    return this.persist();
  }

  /**
   * 保存WebSocket消息历史
   */
  private saveWebsocketToFile(): boolean {
    return this.persist();
  }

  /**
   * 清空历史
   */
  public clearHistory(): boolean {
    this._messages = [];
    this._websocketMessages = [];
    return this.saveOriginalToFile() && this.saveWebsocketToFile();
  }

  /**
   * 删除会话的所有存储
   */
  public async delete(): Promise<void> {
    this.persistenceProvider.delete(this.taskId);
  }
}
