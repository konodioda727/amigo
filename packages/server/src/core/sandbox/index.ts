import { createServer } from "node:net";
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
const EDITOR_CONTAINER_PORT = 13337;
const EDITOR_CONTAINER_PORT_KEY = `${EDITOR_CONTAINER_PORT}/tcp`;
const EDITOR_START_TIMEOUT_MS = 15_000;
const EDITOR_OPEN_FILE_COMMAND_PATH = "/tmp/amigo/open-file.json";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;

const findAvailableHostPort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("无法分配可用端口")));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });

/**
 * 沙箱容器
 */
export class Sandbox {
  private container: Docker.Container | null = null;
  private editorHostPort: number | null = null;
  private editorStarted = false;
  private editorStartPromise: Promise<number> | null = null;

  constructor(private imageName: string = "ai_sandbox") {}

  attachToExistingContainer(container: Docker.Container, editorHostPort: number | null): void {
    this.container = container;
    this.editorHostPort = editorHostPort;
    this.editorStarted = false;
    this.editorStartPromise = null;
  }

  /**
   * 在容器中执行命令
   * @param cmd 具体命令
   */
  async runCommand(cmd: string, abortSignal?: AbortSignal): Promise<string | undefined> {
    if (!this.container) {
      logger.error("[Sandbox] runCommand: container is null");
      return;
    }

    if (abortSignal?.aborted) {
      const abortError = new Error("命令执行已取消");
      abortError.name = "AbortError";
      throw abortError;
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
        let settled = false;

        const cleanupAbortListener = () => {
          abortSignal?.removeEventListener("abort", onAbort);
        };

        const finishReject = (err: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanupAbortListener();
          reject(err);
        };

        const finishResolve = (result: string) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanupAbortListener();
          resolve(result);
        };

        const onAbort = () => {
          logger.info("[Sandbox] 命令执行收到中断信号");
          const abortError = new Error("命令执行已取消");
          abortError.name = "AbortError";
          try {
            stream.destroy(abortError);
          } catch (destroyError) {
            logger.debug("[Sandbox] 终止命令流时出错（可忽略）:", destroyError);
          }
          finishReject(abortError);
        };

        if (abortSignal) {
          abortSignal.addEventListener("abort", onAbort, { once: true });
          if (abortSignal.aborted) {
            onAbort();
            return;
          }
        }

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
          finishResolve(result);
        });

        stream.on("error", (err: Error) => {
          logger.error(`[Sandbox] Stream error: ${err.message}`);
          finishReject(err);
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
      this.editorHostPort = await findAvailableHostPort();

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
          AutoRemove: false,
          Memory: 512 * 1024 * 1024, // 512MB
          PortBindings: {
            [EDITOR_CONTAINER_PORT_KEY]: [
              {
                HostIp: "127.0.0.1",
                HostPort: String(this.editorHostPort),
              },
            ],
          },
        },
        ExposedPorts: {
          [EDITOR_CONTAINER_PORT_KEY]: {},
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

    this.editorStarted = false;
    this.editorStartPromise = null;
    this.editorHostPort = null;
  }

  /**
   * 检查容器是否运行中
   */
  isRunning(): boolean {
    return this.container !== null;
  }

  getEditorHostPort(): number | null {
    return this.editorHostPort;
  }

  async queueEditorOpenFile(filePath: string, line?: number, column?: number): Promise<void> {
    if (!this.container) {
      throw new Error("沙箱未运行，无法下发编辑器打开文件指令");
    }

    const normalizedPath = filePath.replace(/^(\.\/|\/)+/, "");
    const payload = JSON.stringify({
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      path: `/sandbox/${normalizedPath}`,
      ...(typeof line === "number" ? { line } : {}),
      ...(typeof column === "number" ? { column } : {}),
    });
    const encodedPayload = Buffer.from(payload, "utf8").toString("base64");

    await this.runCommand(
      [
        "mkdir -p /tmp/amigo",
        `printf '%s' ${shellQuote(encodedPayload)} | base64 -d > ${shellQuote(EDITOR_OPEN_FILE_COMMAND_PATH)}`,
      ].join("\n"),
    );
  }

  async ensureEditorRunning(): Promise<number> {
    if (!this.container) {
      throw new Error("沙箱未运行，无法启动编辑器");
    }

    if (!this.editorHostPort) {
      throw new Error("编辑器端口未初始化");
    }

    if (this.editorStarted) {
      const isReachable = await this.isEditorReachable();
      if (isReachable) {
        return this.editorHostPort;
      }
      this.editorStarted = false;
    }

    if (!this.editorStartPromise) {
      this.editorStartPromise = this.startEditorProcess()
        .then(async () => {
          await this.waitForEditorReady();
          this.editorStarted = true;
          return this.editorHostPort!;
        })
        .finally(() => {
          this.editorStartPromise = null;
        });
    }

    return this.editorStartPromise;
  }

  private async startEditorProcess(): Promise<void> {
    const command = [
      "if ! command -v code-server >/dev/null 2>&1; then",
      "  echo '__AMIGO_CODE_SERVER_MISSING__';",
      "  exit 127;",
      "fi",
      "mkdir -p /tmp/amigo",
      `nohup code-server --auth none --bind-addr 0.0.0.0:${EDITOR_CONTAINER_PORT} --disable-telemetry --disable-update-check /sandbox >/tmp/amigo/code-server.log 2>&1 &`,
    ].join("\n");

    const output = (await this.runCommand(command)) || "";
    if (output.includes("__AMIGO_CODE_SERVER_MISSING__")) {
      throw new Error("sandbox 镜像中未安装 code-server");
    }
  }

  private async waitForEditorReady(): Promise<void> {
    const deadline = Date.now() + EDITOR_START_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (await this.isEditorReachable()) {
        return;
      }
      await sleep(300);
    }

    throw new Error("code-server 启动超时");
  }

  private async isEditorReachable(): Promise<boolean> {
    if (!this.editorHostPort) {
      return false;
    }

    try {
      const response = await fetch(`http://127.0.0.1:${this.editorHostPort}/healthz`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export { SandboxRegistry, sandboxRegistry } from "./SandboxRegistry";
