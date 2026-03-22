import Docker from "dockerode";
import { logger } from "@/utils/logger";
import { getSandboxContainerName } from "./containerIdentity";
import { Sandbox } from "./index";
import { type ResolvedSandboxOptions, resolveSandboxOptions } from "./options";
import type { SandboxOptions } from "./types";

const EDITOR_CONTAINER_PORT_KEY = "13337/tcp";
const PREVIEW_CONTAINER_PORT_KEY = "3000/tcp";

const extractHostPort = (
  ports: Docker.PortMap | undefined,
  containerPortKey: string,
): number | null => {
  const bindings = ports?.[containerPortKey];
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
  private readonly sandboxOptions: ResolvedSandboxOptions;

  constructor(options?: SandboxOptions) {
    this.sandboxOptions = resolveSandboxOptions(options);
  }

  private isContainerMissingError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const maybeStatusCode = "statusCode" in error ? error.statusCode : undefined;
    return maybeStatusCode === 404;
  }

  private async findExistingContainer(parentId: string): Promise<{
    container: Docker.Container;
    inspectResult: Awaited<ReturnType<Docker.Container["inspect"]>>;
  } | null> {
    const namedContainer = this.docker.getContainer(getSandboxContainerName(parentId));
    try {
      const inspectResult = await namedContainer.inspect();
      return { container: namedContainer, inspectResult };
    } catch (error) {
      if (!this.isContainerMissingError(error)) {
        logger.warn(
          `[SandboxRegistry] 通过容器名查询 sandbox 失败 parentId=${parentId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

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
    return { container, inspectResult };
  }

  private async recoverExistingSandbox(
    parentId: string,
    imageName?: string,
  ): Promise<Sandbox | null> {
    const existing = await this.findExistingContainer(parentId);
    if (!existing) {
      return null;
    }
    const { container, inspectResult } = existing;

    if (!inspectResult.State?.Running) {
      logger.info(`[SandboxRegistry] 恢复已停止的 sandbox 容器: ${parentId}`);
      await container.start();
    } else {
      logger.info(`[SandboxRegistry] 恢复运行中的 sandbox 容器: ${parentId}`);
    }

    const sandbox = new Sandbox(
      imageName ? { ...this.sandboxOptions, imageName } : this.sandboxOptions,
    );
    sandbox.attachToExistingContainer(
      container,
      extractHostPort(inspectResult.NetworkSettings?.Ports, EDITOR_CONTAINER_PORT_KEY),
      extractHostPort(inspectResult.NetworkSettings?.Ports, PREVIEW_CONTAINER_PORT_KEY),
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
    const resolvedImageName = imageName || this.sandboxOptions.imageName;
    logger.info(
      `[SandboxRegistry] getOrCreate called, parentId: ${parentId}, imageName: ${resolvedImageName}`,
    );

    let sandbox: Sandbox | undefined = this.sandboxes.get(parentId);

    if (!sandbox) {
      sandbox = (await this.recoverExistingSandbox(parentId, resolvedImageName)) ?? undefined;
    }

    if (!sandbox) {
      logger.info(`[SandboxRegistry] No existing sandbox, creating new one for: ${parentId}`);
      sandbox = new Sandbox({ ...this.sandboxOptions, imageName: resolvedImageName });
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
      return;
    }

    const existing = await this.findExistingContainer(parentId);
    if (existing) {
      const { container, inspectResult } = existing;

      if (inspectResult.State?.Running) {
        try {
          await container.stop();
        } catch (error) {
          logger.debug("[SandboxRegistry] 停止恢复的容器时出错（可能已停止）:", error);
        }
      }

      try {
        await container.remove({ force: true });
      } catch (error) {
        logger.debug("[SandboxRegistry] 删除恢复的容器时出错（可能已删除）:", error);
      }

      logger.info(`[SandboxRegistry] 直接销毁已存在容器 sandbox: ${parentId}`);
    }

    this.sandboxes.delete(parentId);
    this.refCounts.delete(parentId);
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
