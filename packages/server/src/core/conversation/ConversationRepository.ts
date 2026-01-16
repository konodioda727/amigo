import type { ToolInterface } from "@amigo-llm/types";
import type { ChatOpenAI } from "@langchain/openai";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";
import { getLlm } from "../model";
import { BASIC_TOOLS, CUSTOMED_TOOLS, ToolService } from "../tools";
import { Conversation, type ConversationType } from "./Conversation";

/**
 * 获取所有自定义工具（内置 CUSTOMED_TOOLS + SDK 注册的工具）
 */
// biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
function getAllCustomTools(): ToolInterface<any>[] {
  const registryTools = getGlobalState("registryTools") || [];
  const registryToolNames = new Set(registryTools.map((t) => t.name));
  const filteredCustomedTools = CUSTOMED_TOOLS.filter((tool) => !registryToolNames.has(tool.name));
  return [...filteredCustomedTools, ...registryTools];
}

/**
 * 会话仓库 - 管理会话的创建、查找和持久化
 */
export class ConversationRepository {
  private conversations = new Map<string, Conversation>();

  /**
   * 根据 ID 获取会话
   */
  get(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  /**
   * 检查会话是否存在
   */
  has(id: string): boolean {
    return this.conversations.has(id);
  }

  /**
   * 保存会话到内存
   */
  save(conversation: Conversation): void {
    this.conversations.set(conversation.id, conversation);
  }

  /**
   * 从内存中移除会话
   */
  remove(id: string): boolean {
    return this.conversations.delete(id);
  }

  /**
   * 获取所有会话
   */
  getAll(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  /**
   * 创建新会话
   */
  create(params?: {
    type?: ConversationType;
    parentId?: string;
    customPrompt?: string;
    // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
    tools?: ToolInterface<any>[];
    llm?: ChatOpenAI;
  }): Conversation {
    const allCustomTools = getAllCustomTools();
    const type = params?.type || "main";

    const toolService = new ToolService(
      BASIC_TOOLS,
      params?.tools || (type === "main" ? allCustomTools : []),
    );

    const conversation = Conversation.create({
      toolService,
      llm: params?.llm || getLlm(),
      type,
      parentId: params?.parentId,
      customPrompt: params?.customPrompt,
    });

    this.save(conversation);
    logger.info(`[ConversationRepository] 创建新会话: ${conversation.id}`);

    return conversation;
  }

  /**
   * 从磁盘加载会话（如果内存中不存在）
   */
  getOrLoad(taskId: string): Conversation {
    const existing = this.get(taskId);
    if (existing) {
      return existing;
    }

    const allCustomTools = getAllCustomTools();
    const conversation = Conversation.fromTaskId(taskId, allCustomTools);
    this.save(conversation);

    logger.info(`[ConversationRepository] 从磁盘加载会话: ${taskId}`);
    return conversation;
  }
}

// 全局单例
export const conversationRepository = new ConversationRepository();
