import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";

/**
 * 获取 taskDocs 存储路径
 */
function getTaskDocsPath(taskId: string): string {
  const storagePath = getGlobalState("globalStoragePath") || process.cwd();
  return path.join(storagePath, taskId, "taskDocs");
}

/**
 * 任务状态映射
 * 记录 taskList 中每个任务项与执行它的子任务 taskId 的关联
 */
interface TaskStatusMap {
  [taskDescription: string]: {
    subTaskId?: string; // 正在执行该任务的子任务 ID
    status: "pending" | "in_progress" | "completed" | "failed";
    startedAt?: string;
    completedAt?: string;
    error?: string;
  };
}

/**
 * SubTaskManager
 * 负责管理 taskList 中的任务项与子任务 taskId 的映射关系
 * 支持中断恢复功能
 */
export class SubTaskManager {
  private taskStatusPath: string;
  private taskStatusFile: string;

  constructor(taskId: string) {
    const taskDocsPath = getTaskDocsPath(taskId);
    this.taskStatusPath = path.join(taskDocsPath, "taskStatus");
    this.taskStatusFile = path.join(this.taskStatusPath, "status.json");
    this.ensureStatusDirectory();
  }

  /**
   * 确保 taskStatus 目录存在
   */
  private ensureStatusDirectory(): void {
    if (!existsSync(this.taskStatusPath)) {
      mkdirSync(this.taskStatusPath, { recursive: true });
    }
  }

  /**
   * 读取任务状态映射
   */
  private readStatusMap(): TaskStatusMap {
    if (!existsSync(this.taskStatusFile)) {
      return {};
    }
    try {
      const content = readFileSync(this.taskStatusFile, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      logger.error(`[SubTaskManager] 读取状态文件失败: ${error}`);
      return {};
    }
  }

  /**
   * 写入任务状态映射
   */
  private writeStatusMap(statusMap: TaskStatusMap): void {
    try {
      writeFileSync(this.taskStatusFile, JSON.stringify(statusMap, null, 2), "utf-8");
    } catch (error) {
      logger.error(`[SubTaskManager] 写入状态文件失败: ${error}`);
    }
  }

  /**
   * 标记任务开始执行
   */
  public markTaskInProgress(taskDescription: string, subTaskId: string): void {
    const statusMap = this.readStatusMap();
    statusMap[taskDescription] = {
      subTaskId,
      status: "in_progress",
      startedAt: new Date().toISOString(),
    };
    this.writeStatusMap(statusMap);
    logger.info(`[SubTaskManager] 任务 "${taskDescription}" 开始执行，子任务ID: ${subTaskId}`);
  }

  /**
   * 标记任务完成
   */
  public markTaskCompleted(taskDescription: string): void {
    const statusMap = this.readStatusMap();
    const task = statusMap[taskDescription];
    if (task) {
      task.status = "completed";
      task.completedAt = new Date().toISOString();
      this.writeStatusMap(statusMap);
      logger.info(`[SubTaskManager] 任务 "${taskDescription}" 已完成`);
    }
  }

  /**
   * 标记任务失败
   */
  public markTaskFailed(taskDescription: string, error: string): void {
    const statusMap = this.readStatusMap();
    const task = statusMap[taskDescription];
    if (task) {
      task.status = "failed";
      task.error = error;
      task.completedAt = new Date().toISOString();
      this.writeStatusMap(statusMap);
      logger.error(`[SubTaskManager] 任务 "${taskDescription}" 执行失败: ${error}`);
    }
  }

  /**
   * 获取任务状态
   */
  public getTaskStatus(taskDescription: string): TaskStatusMap[string] | undefined {
    const statusMap = this.readStatusMap();
    return statusMap[taskDescription];
  }

  /**
   * 获取所有进行中的任务
   */
  public getInProgressTasks(): Array<{ description: string; subTaskId: string }> {
    const statusMap = this.readStatusMap();
    return Object.entries(statusMap)
      .filter(([_, status]) => status.status === "in_progress" && status.subTaskId)
      .map(([description, status]) => ({
        description,
        subTaskId: status.subTaskId as string,
      }));
  }

  /**
   * 清理任务状态（用于重新开始）
   */
  public clearTaskStatus(taskDescription: string): void {
    const statusMap = this.readStatusMap();
    delete statusMap[taskDescription];
    this.writeStatusMap(statusMap);
    logger.info(`[SubTaskManager] 清理任务 "${taskDescription}" 的状态`);
  }

  /**
   * 清理所有任务状态
   */
  public clearAllStatus(): void {
    this.writeStatusMap({});
    logger.info(`[SubTaskManager] 清理所有任务状态`);
  }

  /**
   * 获取完整的状态映射（用于调试）
   */
  public getFullStatusMap(): TaskStatusMap {
    return this.readStatusMap();
  }
}
