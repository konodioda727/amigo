import { PassThrough } from "node:stream";
import Docker from "dockerode";
import { logger } from "@/utils/logger";

let docker: Docker | null;
try {
  docker = new Docker();
} catch (error) {
  logger.warn("[Sandbox] Docker 初始化失败，沙箱功能将不可用:", error);
  docker = null;
}

const isLocal = process.platform === "darwin";

/**
 * 沙箱容器
 */
export class Sandbox {
  private container: Docker.Container | null = null;

  constructor(private imageName: string = "ai_sandbox") {}

  /**
   * 在容器中执行命令
   * @param cmd 具体命令
   */
  async runCommand(cmd: string): Promise<string | undefined> {
    if (!this.container) {
      logger.error("[Sandbox] runCommand: container is null");
      return;
    }

    try {
      const exec = await this.container.exec({
        Cmd: ["sh", "-c", cmd],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: "/sandbox",
      });

      const stream = await exec.start({ Tty: false });

      return new Promise((resolve, reject) => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();

        let output = "";
        let errorOutput = "";

        stdout.on("data", (chunk: Buffer) => {
          output += chunk.toString("utf8");
        });

        stderr.on("data", (chunk: Buffer) => {
          errorOutput += chunk.toString("utf8");
        });

        // 使用 dockerode 的 demuxStream 来分离 stdout 和 stderr
        docker!.modem.demuxStream(stream, stdout, stderr);

        stream.on("end", () => {
          const result = output + errorOutput;
          logger.debug(`[Sandbox] Command completed, output: ${result.substring(0, 200)}`);
          resolve(result);
        });

        stream.on("error", (err: Error) => {
          logger.error(`[Sandbox] Stream error: ${err.message}`);
          reject(err);
        });
      });
    } catch (error) {
      logger.error(
        `[Sandbox] runCommand error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 容器初始化
   */
  async init(taskId?: string): Promise<void> {
    if (!docker) {
      throw new Error("Docker 未初始化，请确保 Docker daemon 正在运行");
    }

    try {
      logger.info(`[Sandbox] Creating container with image: ${this.imageName}`);

      // 添加标签以便后续识别和清理
      const labels: Record<string, string> = {
        "amigo.managed": "true",
        "amigo.type": "sandbox",
      };

      if (taskId) {
        labels["amigo.taskId"] = taskId;
      }

      this.container = await docker.createContainer({
        Image: this.imageName,
        Tty: false,
        Labels: labels,
        HostConfig: {
          Runtime: isLocal ? "runc" : "runsc",
          AutoRemove: true,
          Memory: 512 * 1024 * 1024, // 512MB
        },
        WorkingDir: "/sandbox",
      });

      await this.container.start();
      logger.info("[Sandbox] 容器已启动");
    } catch (error) {
      logger.error(
        `[Sandbox] init() error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.container = null;
      throw error;
    }
  }

  /**
   * 销毁容器
   */
  async destroy(): Promise<void> {
    if (this.container) {
      try {
        // 先停止容器
        await this.container.stop();
        logger.info("[Sandbox] 容器已停止");
      } catch (error) {
        // 容器可能已经停止，忽略错误
        logger.debug("[Sandbox] 容器停止时出错（可能已停止）:", error);
      }

      try {
        // 删除容器（即使设置了 AutoRemove，显式删除更安全）
        await this.container.remove({ force: true });
        logger.info("[Sandbox] 容器已删除");
      } catch (error) {
        // 容器可能已经被 AutoRemove 删除，忽略错误
        logger.debug("[Sandbox] 容器删除时出错（可能已自动删除）:", error);
      }

      this.container = null;
    }
  }

  /**
   * 检查容器是否运行中
   */
  isRunning(): boolean {
    return this.container !== null;
  }
}

export { SandboxRegistry, sandboxRegistry } from "./SandboxRegistry";
