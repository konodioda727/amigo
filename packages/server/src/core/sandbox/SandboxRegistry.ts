import Docker from "dockerode";
import { logger } from "@/utils/logger";
import { Sandbox } from "./index";

const EDITOR_CONTAINER_PORT_KEY = "13337/tcp";

const extractEditorHostPort = (ports: Docker.PortMap | undefined): number | null => {
  const bindings = ports?.[EDITOR_CONTAINER_PORT_KEY];
  const hostPort = bindings?.[0]?.HostPort;
  if (!hostPort) {
    return null;
  }

  const parsed = Number.parseInt(hostPort, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Sandbox 注册表 - 管理 sandbox 生命周期
 * 以 parentId 为 key，确保主任务和所有子任务共享同一个 sandbox
 */
export class SandboxRegistry {
  private sandboxes = new Map<string, Sandbox>();
  private refCounts = new Map<string, number>();
  private docker = new Docker();

  private async recoverExistingSandbox(
    parentId: string,
    imageName?: string,
  ): Promise<Sandbox | null> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: ["amigo.managed=true", "amigo.type=sandbox", `amigo.taskId=${parentId}`],
      },
    });

    if (containers.length === 0) {
      return null;
    }

    const selected = containers.sort((a, b) => (b.Created || 0) - (a.Created || 0))[0];
    if (!selected?.Id) {
      return null;
    }

    const container = this.docker.getContainer(selected.Id);
    const inspectResult = await container.inspect();

    if (!inspectResult.State?.Running) {
      logger.info(`[SandboxRegistry] 恢复已停止的 sandbox 容器: ${parentId}`);
      await container.start();
    } else {
      logger.info(`[SandboxRegistry] 恢复运行中的 sandbox 容器: ${parentId}`);
    }

    const sandbox = new Sandbox(imageName);
    sandbox.attachToExistingContainer(
      container,
      extractEditorHostPort(inspectResult.NetworkSettings?.Ports),
    );
    this.sandboxes.set(parentId, sandbox);
    this.refCounts.set(parentId, 0);
    return sandbox;
  }

  /**
   * 获取或创建 sandbox
   * @param parentId 父任务 ID（主任务传自己的 ID）
   * @param imageName Docker 镜像名称
   */
  async getOrCreate(parentId: string, imageName?: string): Promise<Sandbox> {
    logger.info(
      `[SandboxRegistry] getOrCreate called, parentId: ${parentId}, imageName: ${imageName}`,
    );

    let sandbox = this.sandboxes.get(parentId);

    if (!sandbox) {
      sandbox = await this.recoverExistingSandbox(parentId, imageName);
    }

    if (!sandbox) {
      logger.info(`[SandboxRegistry] No existing sandbox, creating new one for: ${parentId}`);
      sandbox = new Sandbox(imageName);
      await sandbox.init(parentId); // 传递 taskId 用于标签
      this.sandboxes.set(parentId, sandbox);
      this.refCounts.set(parentId, 0);
      logger.info(`[SandboxRegistry] 创建 sandbox: ${parentId}`);
    } else {
      logger.info(`[SandboxRegistry] Reusing existing sandbox for: ${parentId}`);
    }

    // 增加引用计数
    this.refCounts.set(parentId, (this.refCounts.get(parentId) || 0) + 1);
    logger.info(`[SandboxRegistry] refCount for ${parentId}: ${this.refCounts.get(parentId)}`);

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
