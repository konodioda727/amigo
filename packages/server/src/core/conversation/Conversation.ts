import type { ConversationStatus, ToolInterface } from "@amigo-llm/types";
import type { ChatOpenAI } from "@langchain/openai";
import { v4 as uuidV4 } from "uuid";
import { FilePersistedMemory } from "../memory";
import { getLlm } from "../model";
import { getSystemPrompt } from "../systemPrompt";
import { BASIC_TOOLS, ToolService } from "../tools";

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

    // 恢复工具配置
    const toolNames = memory.toolNames;
    const totalTools = BASIC_TOOLS.concat(allCustomTools);
    const userCustomedTools = toolNames
      .map((name) => totalTools.find((tool) => tool.name === name))
      // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
      .filter((tool): tool is ToolInterface<any> => tool !== undefined);

    const toolService = new ToolService(
      BASIC_TOOLS,
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
