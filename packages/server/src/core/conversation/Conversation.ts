import type {
  ConversationStatus,
  PendingToolCall,
  SERVER_SEND_MESSAGE_NAME,
  SubTaskStatus,
  ToolInterface,
} from "@amigo-llm/types";
import type { ChatOpenAI } from "@langchain/openai";
import { v4 as uuidV4 } from "uuid";
import { FilePersistedMemory } from "../memory";
import { getLlm } from "../model";
import { getSystemPrompt } from "../systemPrompt";
import { MAIN_BASIC_TOOLS, SUB_BASIC_TOOLS, ToolService } from "../tools";
import { broadcaster } from "./WebSocketBroadcaster";

export type ConversationType = "main" | "sub";

/**
 * 会话
 */
export class Conversation {
  readonly id: string;
  readonly memory: FilePersistedMemory;
  readonly toolService: ToolService;
  readonly llm: ChatOpenAI;
  readonly type: ConversationType;
  readonly parentId?: string;

  private _userInput = "";
  private _isAborted = false;
  private _pendingToolCall: PendingToolCall | null = null;

  private constructor(params: {
    id: string;
    memory: FilePersistedMemory;
    toolService: ToolService;
    llm: ChatOpenAI;
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

  /**
   * 创建新会话
   */
  static create(params: {
    toolService: ToolService;
    llm: ChatOpenAI;
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

    // 初始化系统提示词
    let systemPrompt = getSystemPrompt(params.toolService, type);
    if (params.customPrompt) {
      systemPrompt += `\n\n=====用户自定义提示词:\n${params.customPrompt}`;
    }

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
    this.memory.updateSubTask(description, status);

    // 广播状态更新
    broadcaster.broadcast(this.id, {
      type: "taskStatusMapUpdated" as SERVER_SEND_MESSAGE_NAME,
      data: {
        taskId: this.id,
        subTasks: this.memory.subTasks,
      },
    } as any);
  }

  /**
   * 清理子任务状态
   */
  public clearSubTask(description: string): void {
    this.memory.clearSubTask(description);

    broadcaster.broadcast(this.id, {
      type: "taskStatusMapUpdated" as SERVER_SEND_MESSAGE_NAME,
      data: {
        taskId: this.id,
        subTasks: this.memory.subTasks,
      },
    } as any);
  }

  /**
   * 清理所有子任务状态
   */
  public clearAllSubTasks(): void {
    this.memory.clearAllSubTasks();

    broadcaster.broadcast(this.id, {
      type: "taskStatusMapUpdated" as SERVER_SEND_MESSAGE_NAME,
      data: {
        taskId: this.id,
        subTasks: this.memory.subTasks,
      },
    } as any);
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
    const baseTools = type === "main" ? MAIN_BASIC_TOOLS : SUB_BASIC_TOOLS;

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

    // 恢复 pendingToolCall
    if (memory.pendingToolCall) {
      conversation._pendingToolCall = memory.pendingToolCall;
    }

    // 如果是新会话（文件不存在或为空），注入 systemPrompt
    if (memory.isNewSession()) {
      const systemPrompt = getSystemPrompt(toolService, type);
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
