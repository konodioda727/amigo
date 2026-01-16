import { logger } from "@/utils/logger";
import { Sandbox } from "./index";

/**
 * Sandbox 注册表 - 管理 sandbox 生命周期
 * 以 parentId 为 key，确保主任务和所有子任务共享同一个 sandbox
 */
export class SandboxRegistry {
  private sandboxes = new Map<string, Sandbox>();
  private refCounts = new Map<string, number>();

  /**
   * 获取或创建 sandbox
   * @param parentId 父任务 ID（主任务传自己的 ID）
   * @param imageName Docker 镜像名称
   */
  async getOrCreate(parentId: string, imageName?: string): Promise<Sandbox> {
    let sandbox = this.sandboxes.get(parentId);

    if (!sandbox) {
      sandbox = new Sandbox(imageName);
      await sandbox.init();
      this.sandboxes.set(parentId, sandbox);
      this.refCounts.set(parentId, 0);
      logger.info(`[SandboxRegistry] 创建 sandbox: ${parentId}`);
    }

    // 增加引用计数
    this.refCounts.set(parentId, (this.refCounts.get(parentId) || 0) + 1);

    return sandbox;
  }

  /**
   * 获取已存在的 sandbox（不创建新的）
   */
  get(parentId: string): Sandbox | undefined {
    return this.sandboxes.get(parentId);
  }

  /**
   * 检查 sandbox 是否存在
   */
  has(parentId: string): boolean {
    return this.sandboxes.has(parentId);
  }

  /**
   * 释放 sandbox 引用
   */
  async release(parentId: string): Promise<void> {
    const count = (this.refCounts.get(parentId) || 1) - 1;
    this.refCounts.set(parentId, count);

    if (count <= 0) {
      await this.destroy(parentId);
    }
  }

  /**
   * 强制销毁 sandbox
   */
  async destroy(parentId: string): Promise<void> {
    const sandbox = this.sandboxes.get(parentId);
    if (sandbox) {
      await sandbox.destroy();
      this.sandboxes.delete(parentId);
      this.refCounts.delete(parentId);
      logger.info(`[SandboxRegistry] 销毁 sandbox: ${parentId}`);
    }
  }

  /**
   * 销毁所有 sandbox
   */
  async destroyAll(): Promise<void> {
    const ids = Array.from(this.sandboxes.keys());
    await Promise.all(ids.map((id) => this.destroy(id)));
  }
}

export const sandboxRegistry = new SandboxRegistry();
