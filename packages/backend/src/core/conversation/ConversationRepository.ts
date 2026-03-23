import type { ToolInterface } from "@amigo-llm/types";
import { getConversationPersistenceProvider } from "@/core/persistence";
import { getSandboxManager } from "@/core/sandbox";
import { getSandboxContainerName } from "@/core/sandbox/containerIdentity";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";
import { type AmigoLlm, getLlm } from "../model";
import { CUSTOMED_TOOLS, getBaseTools, ToolService } from "../tools";
import { Conversation, type ConversationType } from "./Conversation";

/**
 * 获取所有自定义工具（内置 CUSTOMED_TOOLS + SDK 注册的工具）
 */
function getAllCustomTools(): ToolInterface<unknown>[] {
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

  private buildTaskRelationGraph(): {
    existingTaskIds: Set<string>;
    parentMap: Map<string, string>;
    childrenMap: Map<string, Set<string>>;
  } {
    const existingTaskIds = new Set<string>();
    const parentMap = new Map<string, string>();
    const childrenMap = new Map<string, Set<string>>();
    const persistenceProvider = getConversationPersistenceProvider();

    const addRelation = (parentId: string, childId: string): void => {
      const children = childrenMap.get(parentId) || new Set<string>();
      children.add(childId);
      childrenMap.set(parentId, children);
    };

    for (const relation of persistenceProvider.listConversationRelations()) {
      existingTaskIds.add(relation.taskId);
      if (!relation.fatherTaskId) {
        continue;
      }
      parentMap.set(relation.taskId, relation.fatherTaskId);
      addRelation(relation.fatherTaskId, relation.taskId);
    }

    for (const conversation of this.getAll()) {
      existingTaskIds.add(conversation.id);
      if (!conversation.parentId) {
        continue;
      }
      parentMap.set(conversation.id, conversation.parentId);
      addRelation(conversation.parentId, conversation.id);
    }

    return { existingTaskIds, parentMap, childrenMap };
  }

  private collectTaskTree(taskId: string, childrenMap: Map<string, Set<string>>): string[] {
    const allTaskIds: string[] = [];
    const visited = new Set<string>();

    const dfs = (currentTaskId: string): void => {
      if (visited.has(currentTaskId)) {
        return;
      }

      visited.add(currentTaskId);
      allTaskIds.push(currentTaskId);

      const children = childrenMap.get(currentTaskId);
      if (!children) {
        return;
      }

      for (const childId of children) {
        dfs(childId);
      }
    };

    dfs(taskId);
    return allTaskIds;
  }

  private deleteTaskStorage(taskId: string): boolean {
    return getConversationPersistenceProvider().delete(taskId);
  }

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
    const { existingTaskIds, parentMap, childrenMap } = this.buildTaskRelationGraph();
    if (!existingTaskIds.has(taskId)) {
      logger.warn(`[ConversationRepository] 任务不存在: ${taskId}`);
      return deletedIds;
    }

    // 只有删除主任务时才删除 sandbox（子任务共享父任务的 sandbox）
    const rootConversation = this.get(taskId);
    const rootParentId = rootConversation?.parentId || parentMap.get(taskId);
    const shouldDeleteSandbox = !rootParentId;
    const sandboxKey = rootParentId || taskId;

    // 收集所有需要删除的任务（包括主任务和所有子任务）
    const allTaskIds = this.collectTaskTree(taskId, childrenMap);

    // 删除所有会话
    for (const id of allTaskIds) {
      const conversation = this.get(id);
      if (conversation) {
        // 如果会话正在运行，先中断
        if (!["idle", "completed", "aborted"].includes(conversation.status)) {
          const { taskOrchestrator } = await import("./TaskOrchestrator");
          taskOrchestrator.interrupt(conversation);
        }
      }

      const deletedFromStorage = this.deleteTaskStorage(id);
      const deletedFromMemory = this.remove(id);
      if (deletedFromStorage || deletedFromMemory) {
        deletedIds.push(id);
        logger.info(`[ConversationRepository] 已删除会话: ${id}`);
      }
    }

    // 只有删除主任务时才卸载 sandbox
    if (shouldDeleteSandbox) {
      const sandboxManager = getSandboxManager();
      const shouldRunDockerCleanup = !sandboxManager.has(sandboxKey);
      let destroyFailed = false;

      try {
        await sandboxManager.destroy(sandboxKey);
        logger.info(`[ConversationRepository] 已从 registry 卸载 sandbox: ${sandboxKey}`);
      } catch (error) {
        destroyFailed = true;
        logger.warn(
          `[ConversationRepository] sandbox manager destroy 失败，继续尝试 Docker 兜底清理: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (shouldRunDockerCleanup || destroyFailed) {
        // 覆盖服务重启后 registry 丢失但容器仍存在的情况。
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
      const matchedIds = new Set<string>();

      const namedContainer = docker.getContainer(getSandboxContainerName(sandboxKey));
      try {
        const inspectResult = await namedContainer.inspect();
        if (inspectResult.Id) {
          matchedIds.add(inspectResult.Id);
        }
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? error.statusCode
            : undefined;
        if (statusCode !== 404) {
          logger.warn(
            `[ConversationRepository] 通过容器名查找 sandbox 失败: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // 列出所有容器（包括已停止的），过滤带有 amigo 标签的
      const containers = await docker.listContainers({
        all: true,
        filters: {
          label: ["amigo.managed=true", `amigo.taskId=${sandboxKey}`],
        },
      });

      for (const containerInfo of containers) {
        if (containerInfo.Id) {
          matchedIds.add(containerInfo.Id);
        }
      }

      logger.info(`[ConversationRepository] 找到 ${matchedIds.size} 个匹配的容器`);

      // 删除找到的容器
      for (const containerId of matchedIds) {
        try {
          const container = docker.getContainer(containerId);

          // 先尝试停止
          try {
            await container.stop();
            logger.info(`[ConversationRepository] 已停止容器: ${containerId}`);
          } catch (stopError) {
            // 容器可能已经停止，忽略错误
            logger.debug(`[ConversationRepository] 停止容器时出错（可能已停止）: ${stopError}`);
          }

          // 删除容器
          await container.remove({ force: true });
          logger.info(`[ConversationRepository] 已删除孤立容器: ${containerId}`);
        } catch (error) {
          logger.warn(`[ConversationRepository] 删除容器 ${containerId} 时出错: ${error}`);
        }
      }

      if (matchedIds.size === 0) {
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
    id?: string;
    type?: ConversationType;
    parentId?: string;
    customPrompt?: string;
    toolNames?: string[];
    tools?: ToolInterface<unknown>[];
    llm?: AmigoLlm;
  }): Conversation {
    const allCustomTools = getAllCustomTools();
    const type = params?.type || "main";
    const requestedToolNames = params?.toolNames?.map((name) => name.trim()).filter(Boolean);
    const baseTools = getBaseTools(type).filter(
      (tool) => !requestedToolNames || requestedToolNames.includes(tool.name),
    );
    const customToolsSource = params?.tools || (type === "main" ? allCustomTools : []);
    const customTools = customToolsSource.filter(
      (tool) => !requestedToolNames || requestedToolNames.includes(tool.name),
    );

    const toolService = new ToolService(baseTools, customTools);

    const conversation = Conversation.create({
      id: params?.id,
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
    if (!getConversationPersistenceProvider().exists(taskId)) {
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
