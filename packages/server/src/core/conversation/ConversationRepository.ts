import type { ToolInterface } from "@amigo-llm/types";
import type { ChatOpenAI } from "@langchain/openai";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";
import { FilePersistedMemory } from "../memory";
import { getLlm } from "../model";
import { CUSTOMED_TOOLS, MAIN_BASIC_TOOLS, SUB_BASIC_TOOLS, ToolService } from "../tools";
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
   * 递归删除会话及其所有子任务
   * @returns 被删除的所有任务 ID 列表（包括主任务和子任务）
   */
  async deleteWithChildren(taskId: string): Promise<string[]> {
    const deletedIds: string[] = [];

    // 先获取主任务以确定 sandbox key
    const mainConversation = this.get(taskId);
    if (!mainConversation) {
      logger.warn(`[ConversationRepository] 任务不存在: ${taskId}`);
      return deletedIds;
    }

    // 只有删除主任务时才删除 sandbox（子任务共享父任务的 sandbox）
    const shouldDeleteSandbox = !mainConversation.parentId;
    const sandboxKey = mainConversation.parentId || taskId;

    // 递归收集所有子任务
    const collectChildren = (parentId: string): string[] => {
      const children: string[] = [];
      for (const conv of this.getAll()) {
        if (conv.parentId === parentId) {
          children.push(conv.id);
          // 递归收集子任务的子任务
          children.push(...collectChildren(conv.id));
        }
      }
      return children;
    };

    // 收集所有需要删除的任务（包括主任务和所有子任务）
    const allTaskIds = [taskId, ...collectChildren(taskId)];

    // 删除所有会话
    for (const id of allTaskIds) {
      const conversation = this.get(id);
      if (conversation) {
        // 如果会话正在运行，先中断
        if (!["idle", "completed", "aborted"].includes(conversation.status)) {
          const { taskOrchestrator } = await import("./TaskOrchestrator");
          taskOrchestrator.interrupt(conversation);
        }

        // 删除会话存储
        await conversation.memory.delete();

        // 从内存中移除
        this.remove(id);
        deletedIds.push(id);

        logger.info(`[ConversationRepository] 已删除会话: ${id}`);
      }
    }

    // 只有删除主任务时才卸载 sandbox
    if (shouldDeleteSandbox) {
      const { sandboxRegistry } = await import("../sandbox/SandboxRegistry");

      // 先尝试从 registry 中删除（如果存在）
      if (sandboxRegistry.has(sandboxKey)) {
        await sandboxRegistry.destroy(sandboxKey);
        logger.info(`[ConversationRepository] 已从 registry 卸载 sandbox: ${sandboxKey}`);
      } else {
        // 如果 registry 中不存在（例如服务器重启后），尝试直接通过 Docker API 清理
        logger.info(`[ConversationRepository] Sandbox 不在 registry 中，尝试直接清理容器`);
        await this.cleanupOrphanedContainer(sandboxKey);
      }
    } else {
      logger.info(
        `[ConversationRepository] 跳过 sandbox 删除（子任务删除，父任务 ${sandboxKey} 可能仍在使用）`,
      );
    }

    return deletedIds;
  }

  /**
   * 清理可能遗留的容器（服务器重启后 registry 丢失的情况）
   */
  private async cleanupOrphanedContainer(sandboxKey: string): Promise<void> {
    try {
      const Docker = (await import("dockerode")).default;
      const docker = new Docker();

      // 列出所有容器（包括已停止的），过滤带有 amigo 标签的
      const containers = await docker.listContainers({
        all: true,
        filters: {
          label: ["amigo.managed=true", `amigo.taskId=${sandboxKey}`],
        },
      });

      logger.info(`[ConversationRepository] 找到 ${containers.length} 个匹配的容器`);

      // 删除找到的容器
      for (const containerInfo of containers) {
        try {
          const container = docker.getContainer(containerInfo.Id);

          // 先尝试停止
          try {
            await container.stop();
            logger.info(`[ConversationRepository] 已停止容器: ${containerInfo.Id}`);
          } catch (stopError) {
            // 容器可能已经停止，忽略错误
            logger.debug(`[ConversationRepository] 停止容器时出错（可能已停止）: ${stopError}`);
          }

          // 删除容器
          await container.remove({ force: true });
          logger.info(`[ConversationRepository] 已删除孤立容器: ${containerInfo.Id}`);
        } catch (error) {
          logger.warn(`[ConversationRepository] 删除容器 ${containerInfo.Id} 时出错: ${error}`);
        }
      }

      if (containers.length === 0) {
        logger.info(`[ConversationRepository] 未找到需要清理的孤立容器`);
      }
    } catch (error) {
      logger.warn(`[ConversationRepository] 清理孤立容器时出错: ${error}`);
    }
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

    // 根据任务类型过滤基础工具
    const baseTools = type === "main" ? MAIN_BASIC_TOOLS : SUB_BASIC_TOOLS;

    const toolService = new ToolService(
      baseTools,
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
   * 注意：此方法会在任务不存在时自动创建，仅用于内部创建流程
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

  /**
   * 从磁盘加载已存在的会话（不会自动创建）
   * @returns 会话对象，如果不存在则返回 null
   */
  load(taskId: string): Conversation | null {
    // 先检查内存
    const existing = this.get(taskId);
    if (existing) {
      return existing;
    }

    // 检查磁盘上是否存在
    if (!FilePersistedMemory.exists(taskId)) {
      logger.warn(`[ConversationRepository] 任务不存在: ${taskId}`);
      return null;
    }

    // 从磁盘加载
    const allCustomTools = getAllCustomTools();
    const conversation = Conversation.fromTaskId(taskId, allCustomTools);
    this.save(conversation);

    logger.info(`[ConversationRepository] 从磁盘加载已存在的会话: ${taskId}`);
    return conversation;
  }
}

// 全局单例
export const conversationRepository = new ConversationRepository();
