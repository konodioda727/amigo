import Docker from "dockerode";
import { logger } from "@/utils/logger";

const docker = new Docker();

const isLocal = process.platform === "darwin";

/**
 * 沙箱容器
 */
export class Sandbox {
  private container: Docker.Container | null = null;

  constructor(private imageName: string = "") {}

  /**
   * 在容器中执行命令
   * @param cmd 具体命令
   */
  async runCommand(cmd: string): Promise<string | undefined> {
    if (!this.container) {
      return;
    }
    const exec = await this.container.exec({
      Cmd: ["sh", "-c", cmd],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: "/sandbox",
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise((resolve, reject) => {
      let output = "";
      stream.on("data", (chunk: Buffer) => {
        let offset = 0;
        while (offset < chunk.length) {
          // 跳过 8 字节头：[1, 0, 0, 0, size_4_bytes]
          const size = chunk.readUInt32BE(offset + 4);
          output += chunk.toString("utf8", offset + 8, offset + 8 + size);
          offset += 8 + size;
        }
      });
      stream.on("end", () => resolve(output));
      stream.on("error", reject);
    });
  }

  /**
   * 容器初始化
   */
  async init(): Promise<void> {
    this.container = await docker.createContainer({
      Image: this.imageName,
      HostConfig: {
        Runtime: isLocal ? "runc" : "runsc",
        AutoRemove: true,
        Memory: 512 * 1024 * 1024, // 512MB
      },
    });

    await this.container.start();
  }

  /**
   * 销毁容器
   */
  async destroy(): Promise<void> {
    if (this.container) {
      try {
        await this.container.stop();
      } catch (error) {
        // 容器可能已经停止，忽略错误
        logger.debug("[Sandbox] 容器停止时出错（可能已停止）:", error);
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
