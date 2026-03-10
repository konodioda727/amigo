import type {
  ContextUsageStatus,
  ConversationStatus,
  PendingToolCall,
  SubTaskStatus,
  TaskStatusMapUpdatedData,
  ToolInterface,
  WebSocketMessage,
} from "@amigo-llm/types";
import { v4 as uuidV4 } from "uuid";
import { getGlobalState } from "@/globalState";
import { FilePersistedMemory } from "../memory";
import { type AmigoLlm, getLlm } from "../model";
import { getSystemPrompt } from "../systemPrompt";
import { getTaskId } from "../templates/checklistParser";
import { getBaseTools, ToolService } from "../tools";
import {
  getConfiguredAutoApproveToolNames,
  normalizeAutoApproveToolNames,
} from "./autoApproveTools";
import { broadcaster } from "./WebSocketBroadcaster";

export type ConversationType = "main" | "sub";

/**
 * 会话
 */
export class Conversation {
  readonly id: string;
  readonly memory: FilePersistedMemory;
  readonly toolService: ToolService;
  readonly llm: AmigoLlm;
  readonly type: ConversationType;
  readonly parentId?: string;

  private _userInput = "";
  private _isAborted = false;
  private _pendingToolCall: PendingToolCall | null = null;

  private constructor(params: {
    id: string;
    memory: FilePersistedMemory;
    toolService: ToolService;
    llm: AmigoLlm;
    type: ConversationType;
    parentId?: string;
  }) {
    this.id = params.id;
    this.memory = params.memory;
    this.toolService = params.toolService;
    this.llm = params.llm;
    this.type = params.type;
    this.parentId = params.parentId;
  }

  private syncAutoApproveToolNamesToTaskStatus(): void {
    if (this.memory.autoApproveToolNames.length > 0) {
      return;
    }
    this.memory.setAutoApproveToolNames(getConfiguredAutoApproveToolNames());
  }

  public broadcastTaskStatusMapUpdated(): void {
    const message: WebSocketMessage<"taskStatusMapUpdated"> = {
      type: "taskStatusMapUpdated",
      data: {
        taskId: this.id,
        subTasks: this.memory.subTasks,
        autoApproveToolNames: this.memory.autoApproveToolNames,
        contextUsage: this.memory.contextUsage,
      } satisfies TaskStatusMapUpdatedData,
    };
    broadcaster.broadcast(this.id, message);
  }

  public setAutoApproveToolNames(toolNames: string[]): void {
    this.memory.setAutoApproveToolNames(normalizeAutoApproveToolNames(toolNames));
    this.broadcastTaskStatusMapUpdated();
  }

  public setContextUsage(contextUsage: ContextUsageStatus | undefined): void {
    this.memory.setContextUsage(contextUsage);
    this.broadcastTaskStatusMapUpdated();
  }

  get status(): ConversationStatus {
    return this.memory.conversationStatus;
  }

  set status(value: ConversationStatus) {
    this.memory.conversationStatus = value;
  }

  get userInput(): string {
    return this._userInput;
  }

  set userInput(value: string) {
    this._userInput = value;
  }

  get isAborted(): boolean {
    return this._isAborted;
  }

  set isAborted(value: boolean) {
    this._isAborted = value;
  }

  get pendingToolCall(): PendingToolCall | null {
    return this._pendingToolCall;
  }

  set pendingToolCall(value: PendingToolCall | null) {
    this._pendingToolCall = value;
    this.memory.setPendingToolCall(value);
  }

  get isNew(): boolean {
    return this.memory.isNewSession();
  }

  private static buildInitialSystemPrompt(
    toolService: ToolService,
    type: ConversationType,
    customPrompt?: string,
  ): string {
    const configuredPrompt = getGlobalState("systemPrompts")?.[type]?.trim();
    let systemPrompt = configuredPrompt || getSystemPrompt(toolService, type);
    const extraSystemPrompt = (getGlobalState("extraSystemPrompt") || "").trim();
    if (extraSystemPrompt) {
      systemPrompt += `\n\n=====应用追加系统提示词:\n${extraSystemPrompt}`;
    }
    if (customPrompt?.trim()) {
      systemPrompt += `\n\n=====用户自定义提示词:\n${customPrompt.trim()}`;
    }
    return systemPrompt;
  }

  /**
   * 创建新会话
   */
  static create(params: {
    toolService: ToolService;
    llm: AmigoLlm;
    type?: ConversationType;
    parentId?: string;
    customPrompt?: string;
  }): Conversation {
    const id = uuidV4();
    const memory = new FilePersistedMemory(id, params.parentId);
    const type = params.type || "main";

    const conversation = new Conversation({
      id,
      memory,
      toolService: params.toolService,
      llm: params.llm,
      type,
      parentId: params.parentId,
    });
    conversation.syncAutoApproveToolNamesToTaskStatus();

    // 初始化系统提示词
    const systemPrompt = Conversation.buildInitialSystemPrompt(
      params.toolService,
      type,
      params.customPrompt,
    );

    memory.addMessage({
      role: "system",
      type: "system",
      content: systemPrompt,
    });

    // 保存工具名称用于恢复
    if (type === "sub") {
      const toolNames = params.toolService.customedTools.map((t) => t.name);
      memory.setToolNames(toolNames);
    }

    return conversation;
  }

  /**
   * 更新子任务状态并广播
   */
  public updateSubTaskStatus(description: string, status: SubTaskStatus): void {
    const taskKey = getTaskId(description) || description;
    if (taskKey !== description && this.memory.subTasks[description]) {
      this.memory.clearSubTask(description);
    }
    this.memory.updateSubTask(taskKey, {
      ...status,
      description: status.description ?? description,
    });

    this.broadcastTaskStatusMapUpdated();
  }

  /**
   * 清理子任务状态
   */
  public clearSubTask(description: string): void {
    const taskKey = getTaskId(description) || description;
    this.memory.clearSubTask(taskKey);
    if (taskKey !== description) {
      this.memory.clearSubTask(description);
    }

    this.broadcastTaskStatusMapUpdated();
  }

  /**
   * 清理所有子任务状态
   */
  public clearAllSubTasks(): void {
    this.memory.clearAllSubTasks();

    this.broadcastTaskStatusMapUpdated();
  }

  /**
   * 从已有 taskId 恢复会话
   */
  static fromTaskId(
    taskId: string,
    // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
    allCustomTools: ToolInterface<any>[],
  ): Conversation {
    const memory = new FilePersistedMemory(taskId);
    const llm = getLlm();
    const type: ConversationType = memory.getFatherTaskId ? "sub" : "main";

    // 根据任务类型过滤基础工具
    const baseTools = getBaseTools(type);

    // 恢复工具配置
    const toolNames = memory.toolNames;
    const totalTools = baseTools.concat(allCustomTools);
    const userCustomedTools = toolNames
      .map((name) => totalTools.find((tool) => tool.name === name))
      // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
      .filter((tool): tool is ToolInterface<any> => tool !== undefined);

    const toolService = new ToolService(
      baseTools,
      type === "main" ? allCustomTools : userCustomedTools,
    );

    const conversation = new Conversation({
      id: taskId,
      memory,
      toolService,
      llm,
      type,
      parentId: memory.getFatherTaskId,
    });
    conversation.syncAutoApproveToolNamesToTaskStatus();

    // 恢复 pendingToolCall
    if (memory.pendingToolCall) {
      conversation._pendingToolCall = memory.pendingToolCall;
    }

    // 如果是新会话（文件不存在或为空），注入 systemPrompt
    if (memory.isNewSession()) {
      const systemPrompt = Conversation.buildInitialSystemPrompt(toolService, type);
      memory.addMessage({
        role: "system",
        type: "system",
        content: systemPrompt,
      });

      // 保存工具名称用于恢复
      if (type === "sub") {
        const toolNames = toolService.customedTools.map((t) => t.name);
        memory.setToolNames(toolNames);
      }
    }

    return conversation;
  }
}
