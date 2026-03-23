import { mkdir } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import path from "node:path";
import { PassThrough } from "node:stream";
import Docker from "dockerode";
import { getCacheRootPath } from "@/core/storage";
import { getGlobalState } from "@/globalState";
import { type GithubSandboxBinding, getGithubSandboxBindingForTask } from "@/integrations/github";
import { logger } from "@/utils/logger";
import { getSandboxContainerName } from "./containerIdentity";
import { normalizeEditorOpenFilePath } from "./editorFilePath";
import { type ResolvedSandboxOptions, resolveSandboxOptions } from "./options";

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
const PREVIEW_CONTAINER_PORT = 3000;
const PREVIEW_CONTAINER_PORT_KEY = `${PREVIEW_CONTAINER_PORT}/tcp`;
const PREVIEW_START_TIMEOUT_MS = 30_000;
const PREVIEW_PROBE_TIMEOUT_MS = 1_500;
const PREVIEW_LOG_PATH = "/tmp/amigo/dev-server.log";
const PREVIEW_PID_PATH = "/tmp/amigo/dev-server.pid";
const BOOTSTRAP_REPO_MOUNT_PATH = "/tmp/amigo/bootstrap/repo.git";
const PNPM_STORE_CONTAINER_PATH = "/pnpm/store";
const PREVIEW_HTTP_PROBE_HOSTS = ["localhost", "127.0.0.1"] as const;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;
const GITHUB_TOKEN_ENV_KEYS = ["GITHUB_TOKEN", "GH_TOKEN"] as const;

const withAbortableTimeout = <T>(
  timeoutMs: number,
  executor: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return executor(controller.signal).finally(() => {
    clearTimeout(timeout);
  });
};

const canConnectToPort = (host: string, port: number, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });

type SupportedPackageManager = "pnpm" | "npm" | "yarn" | "bun" | "custom" | "none";
type DependencyArtifactState = "no_package_json" | "no_dependencies" | "installed" | "missing";

export interface DependencyInstallStatus {
  status: "idle" | "running" | "success" | "failed" | "not_required";
  packageManager: SupportedPackageManager;
  startedAt?: string;
  finishedAt?: string;
  installCommand?: string;
  logPath: string;
  error?: string;
}

interface DependencyInstallPlan {
  packageManager: SupportedPackageManager;
  installCommand?: string;
}

function getSharedPnpmStoreHostPath(): string {
  const cacheRoot = getGlobalState("globalCachePath");
  if (cacheRoot) {
    return path.resolve(cacheRoot, "pnpm-store");
  }
  return path.resolve(getCacheRootPath(), "pnpm-store");
}

function normalizeSandboxWorkingDir(input: string | undefined): string {
  const trimmed = (input || ".").trim();
  if (!trimmed || trimmed === "." || trimmed === "/sandbox" || trimmed === "sandbox") {
    return ".";
  }

  const normalized = trimmed.replace(/^\/sandbox\/?/, "").replace(/^(\.\/|\/)+/, "");
  return normalized === "sandbox" ? "." : normalized || ".";
}

function getDependencyInstallLogPath(workingDir: string): string {
  const suffix =
    workingDir === "."
      ? "root"
      : workingDir.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "workspace";
  return `/tmp/amigo/dependency-install-${suffix}.log`;
}

function normalizeInstallCommandForComparison(command: string | undefined): string {
  return (command || "").trim().replace(/\s+/g, " ");
}

function getForwardedSandboxEnvVars(): string[] {
  return GITHUB_TOKEN_ENV_KEYS.map((key) => {
    const value = process.env[key]?.trim();
    return value ? `${key}=${value}` : "";
  }).filter(Boolean);
}

function shouldConfigureGithubCredentialHelper(repoUrl: string): boolean {
  try {
    const parsed = new URL(repoUrl);
    return parsed.protocol === "https:" && parsed.hostname === "github.com";
  } catch {
    return false;
  }
}

function buildGithubCredentialHelperCommand(): string {
  return `git config credential.helper ${shellQuote(
    '!f() { if [ "$1" = get ]; then echo "username=x-access-token"; echo "password=${GITHUB_TOKEN:-${GH_TOKEN:-}}"; fi; }; f',
  )}`;
}

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
  private previewHostPort: number | null = null;
  private editorStarted = false;
  private editorStartPromise: Promise<number> | null = null;
  private dependencyInstallStates = new Map<string, DependencyInstallStatus>();
  private dependencyInstallPromises = new Map<string, Promise<DependencyInstallStatus>>();

  constructor(private readonly options: ResolvedSandboxOptions = resolveSandboxOptions()) {}

  attachToExistingContainer(
    container: Docker.Container,
    editorHostPort: number | null,
    previewHostPort: number | null,
  ): void {
    this.container = container;
    this.editorHostPort = editorHostPort;
    this.previewHostPort = previewHostPort;
    this.editorStarted = false;
    this.editorStartPromise = null;
    this.dependencyInstallStates.clear();
    this.dependencyInstallPromises.clear();
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
        // Use bash so shell built-ins like `source` work consistently while preserving container env.
        Cmd: ["bash", "-c", cmd],
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

  async writeFile(
    filePath: string,
    content: Buffer | string,
    options?: { mode?: number },
  ): Promise<void> {
    if (!this.container) {
      throw new Error("沙箱未运行，无法写入文件");
    }

    const normalizedPath = filePath.trim().startsWith("/sandbox/")
      ? filePath.trim()
      : `/sandbox/${filePath.trim().replace(/^\/+/, "")}`;
    const targetDir = path.posix.dirname(normalizedPath);
    const bufferContent = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

    const exec = await this.container.exec({
      Cmd: [
        "bash",
        "-lc",
        `mkdir -p ${shellQuote(targetDir)} && cat > ${shellQuote(normalizedPath)}`,
      ],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: "/sandbox",
    });

    const stream = await exec.start({ hijack: true, stdin: true });

    await new Promise<void>((resolve, reject) => {
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      let stderrOutput = "";
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      stderr.on("data", (chunk: Buffer) => {
        stderrOutput += chunk.toString("utf8");
      });

      docker!.modem.demuxStream(stream, stdout, stderr);

      stream.on("error", (error: Error) => {
        finish(error);
      });

      stream.on("end", () => {
        if (stderrOutput.trim()) {
          finish(new Error(stderrOutput.trim()));
          return;
        }
        finish();
      });

      stream.write(bufferContent);
      stream.end();
    });

    const inspectResult = await exec.inspect();
    if ((inspectResult.ExitCode || 0) !== 0) {
      throw new Error(`写入文件失败: ${normalizedPath}（exitCode=${inspectResult.ExitCode}）`);
    }

    if (options?.mode !== undefined) {
      await this.runCommand(
        `chmod ${options.mode.toString(8)} ${shellQuote(normalizedPath.replace(/^\/sandbox\//, ""))}`,
      );
    }
  }

  /**
   * 容器初始化
   */
  async init(taskId?: string, githubBindingOverride?: GithubSandboxBinding | null): Promise<void> {
    if (!docker) {
      throw new Error("Docker 未初始化，请确保 Docker daemon 正在运行");
    }

    try {
      logger.info(`[Sandbox] Creating container with image: ${this.options.imageName}`);
      this.editorHostPort = await findAvailableHostPort();
      this.previewHostPort = await findAvailableHostPort();
      const githubBinding =
        githubBindingOverride ?? (taskId ? await getGithubSandboxBindingForTask(taskId) : null);
      const forwardedEnv = getForwardedSandboxEnvVars();
      const binds = githubBinding
        ? [`${githubBinding.mirrorPath}:${BOOTSTRAP_REPO_MOUNT_PATH}:ro`]
        : [];
      const sharedPnpmStoreHostPath = getSharedPnpmStoreHostPath();
      await mkdir(sharedPnpmStoreHostPath, { recursive: true });
      binds.push(`${sharedPnpmStoreHostPath}:${PNPM_STORE_CONTAINER_PATH}`);

      // 添加标签以便后续识别和清理
      const labels: Record<string, string> = {
        "amigo.managed": "true",
        "amigo.type": "sandbox",
      };

      if (taskId) {
        labels["amigo.taskId"] = taskId;
      }

      const createContainerOptions = {
        Image: this.options.imageName,
        Tty: false,
        ...(forwardedEnv.length > 0 ? { Env: forwardedEnv } : {}),
        Labels: labels,
        HostConfig: {
          Runtime: this.options.runtime || (isLocal ? "runc" : "runsc"),
          AutoRemove: false,
          Memory: this.options.memoryLimitBytes,
          ...(binds.length > 0 ? { Binds: binds } : {}),
          PortBindings: {
            [EDITOR_CONTAINER_PORT_KEY]: [
              {
                HostIp: "127.0.0.1",
                HostPort: String(this.editorHostPort),
              },
            ],
            [PREVIEW_CONTAINER_PORT_KEY]: [
              {
                HostIp: "127.0.0.1",
                HostPort: String(this.previewHostPort),
              },
            ],
          },
        },
        ExposedPorts: {
          [EDITOR_CONTAINER_PORT_KEY]: {},
          [PREVIEW_CONTAINER_PORT_KEY]: {},
        },
        WorkingDir: "/sandbox",
        ...(taskId ? { name: getSandboxContainerName(taskId) } : {}),
      } as Docker.ContainerCreateOptions & { name?: string };

      this.container = await docker.createContainer(createContainerOptions);

      await this.container.start();
      if (githubBinding) {
        await this.hydrateBootstrapRepository(
          githubBinding.branch,
          githubBinding.commitSha,
          githubBinding.repoUrl,
        );
      }
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
    this.previewHostPort = null;
    this.dependencyInstallStates.clear();
    this.dependencyInstallPromises.clear();
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

  getPreviewHostPort(): number | null {
    return this.previewHostPort;
  }

  getDirectPreviewBaseUrl(hostname = "localhost"): URL {
    if (!this.previewHostPort) {
      throw new Error("预览端口未初始化");
    }

    return new URL(`http://${hostname}:${this.previewHostPort}`);
  }

  async resolveReachablePreviewBaseUrl(): Promise<URL> {
    if (!this.previewHostPort) {
      throw new Error("预览端口未初始化");
    }

    const reachableHost = await this.findReachablePreviewHost();
    const host = reachableHost || PREVIEW_HTTP_PROBE_HOSTS[0];
    return new URL(`http://${host}:${this.previewHostPort}`);
  }

  getPreviewLogPath(): string {
    return PREVIEW_LOG_PATH;
  }

  getDependencyInstallStatus(workingDir?: string): DependencyInstallStatus {
    const key = normalizeSandboxWorkingDir(workingDir);
    return {
      status: "idle",
      packageManager: "none",
      logPath: getDependencyInstallLogPath(key),
      ...(this.dependencyInstallStates.get(key) || {}),
    };
  }

  async resolveDependencyInstallStatus(params?: {
    workingDir?: string;
    expectedInstallCommand?: string;
  }): Promise<DependencyInstallStatus> {
    const workingDir = normalizeSandboxWorkingDir(params?.workingDir);
    const currentState = this.getDependencyInstallStatus(workingDir);

    if (!["success", "not_required"].includes(currentState.status)) {
      return currentState;
    }

    const expectedCommand = normalizeInstallCommandForComparison(params?.expectedInstallCommand);
    const currentCommand = normalizeInstallCommandForComparison(currentState.installCommand);
    if (expectedCommand && expectedCommand !== currentCommand) {
      this.invalidateDependencyInstallStatus(
        workingDir,
        `install command changed (${currentCommand || "unknown"} -> ${expectedCommand})`,
      );
      return this.getDependencyInstallStatus(workingDir);
    }

    try {
      const artifactState = await this.inspectDependencyArtifacts(workingDir);
      const isReusable =
        currentState.status === "success"
          ? ["installed", "no_dependencies", "no_package_json"].includes(artifactState)
          : ["no_dependencies", "no_package_json"].includes(artifactState);

      if (!isReusable) {
        this.invalidateDependencyInstallStatus(
          workingDir,
          `dependency artifacts are stale (${artifactState})`,
        );
        return this.getDependencyInstallStatus(workingDir);
      }
    } catch (error) {
      logger.warn(
        `[Sandbox] 校验依赖状态失败，将保留现有状态 workingDir=${workingDir}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return currentState;
  }

  async ensureDependenciesInstalled(params?: {
    workingDir?: string;
    abortSignal?: AbortSignal;
    force?: boolean;
  }): Promise<DependencyInstallStatus> {
    if (!this.container) {
      throw new Error("沙箱未运行，无法安装依赖");
    }

    const workingDir = normalizeSandboxWorkingDir(params?.workingDir);
    const existingPromise = this.dependencyInstallPromises.get(workingDir);
    if (existingPromise) {
      return existingPromise;
    }

    const existingState = await this.resolveDependencyInstallStatus({ workingDir });
    if (!params?.force) {
      if (existingState.status === "success" || existingState.status === "not_required") {
        return existingState;
      }
    }

    const promise = this.installDependencies({
      workingDir,
      abortSignal: params?.abortSignal,
    }).finally(() => {
      this.dependencyInstallPromises.delete(workingDir);
    });
    this.dependencyInstallPromises.set(workingDir, promise);

    return promise;
  }

  async installDependenciesWithCommand(params: {
    workingDir?: string;
    installCommand: string;
    abortSignal?: AbortSignal;
    force?: boolean;
  }): Promise<DependencyInstallStatus> {
    if (!this.container) {
      throw new Error("沙箱未运行，无法安装依赖");
    }

    const workingDir = normalizeSandboxWorkingDir(params.workingDir);
    const installCommand = params.installCommand.trim();
    if (!installCommand) {
      throw new Error("installCommand 不能为空");
    }

    const existingPromise = this.dependencyInstallPromises.get(workingDir);
    if (existingPromise) {
      return existingPromise;
    }

    const existingState = await this.resolveDependencyInstallStatus({
      workingDir,
      expectedInstallCommand: installCommand,
    });
    if (!params.force) {
      if (existingState.status === "success" || existingState.status === "not_required") {
        return existingState;
      }
    }

    const promise = this.runDependencyInstallCommand({
      workingDir,
      installCommand,
      abortSignal: params.abortSignal,
    }).finally(() => {
      this.dependencyInstallPromises.delete(workingDir);
    });
    this.dependencyInstallPromises.set(workingDir, promise);

    return promise;
  }

  async queueEditorOpenFile(filePath: string, line?: number, column?: number): Promise<void> {
    if (!this.container) {
      throw new Error("沙箱未运行，无法下发编辑器打开文件指令");
    }

    const payload = JSON.stringify({
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      path: normalizeEditorOpenFilePath(filePath),
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

  async startOrUpdateDevServer(params: {
    startCommand: string;
    workingDir?: string;
    abortSignal?: AbortSignal;
  }): Promise<number> {
    if (!this.container) {
      throw new Error("沙箱未运行，无法启动开发预览服务");
    }

    if (!this.previewHostPort) {
      throw new Error("预览端口未初始化");
    }

    const workingDir = normalizeSandboxWorkingDir(params.workingDir);
    const effectiveWorkingDir = workingDir || ".";
    const encodedCommand = Buffer.from(params.startCommand, "utf8").toString("base64");
    const command = [
      "mkdir -p /tmp/amigo",
      `if [ -f ${shellQuote(PREVIEW_PID_PATH)} ] && kill -0 "$(cat ${shellQuote(PREVIEW_PID_PATH)})" 2>/dev/null; then`,
      `  kill "$(cat ${shellQuote(PREVIEW_PID_PATH)})" 2>/dev/null || true`,
      "  sleep 1",
      "fi",
      `cd ${shellQuote(`/sandbox/${effectiveWorkingDir === "." ? "" : effectiveWorkingDir}`.replace(/\/$/, "") || "/sandbox")}`,
      `export PORT=${PREVIEW_CONTAINER_PORT}`,
      "export HOST=0.0.0.0",
      "export BROWSER=none",
      "export CI=1",
      `export PNPM_STORE_DIR=${shellQuote(PNPM_STORE_CONTAINER_PATH)}`,
      `START_COMMAND=$(printf '%s' ${shellQuote(encodedCommand)} | base64 -d)`,
      `nohup bash -c "$START_COMMAND" >${shellQuote(PREVIEW_LOG_PATH)} 2>&1 &`,
      `echo $! > ${shellQuote(PREVIEW_PID_PATH)}`,
    ].join("\n");

    await this.runCommand(command, params.abortSignal);
    await this.waitForPreviewReady();
    return this.previewHostPort;
  }

  async readPreviewLogTail(lineLimit = 80, abortSignal?: AbortSignal): Promise<string> {
    const output =
      (await this.runCommand(
        `if [ -f ${shellQuote(PREVIEW_LOG_PATH)} ]; then tail -n ${Math.max(1, Math.floor(lineLimit))} ${shellQuote(PREVIEW_LOG_PATH)}; fi`,
        abortSignal,
      )) || "";
    return output.trim();
  }

  async readDependencyInstallLogTail(
    workingDir?: string,
    lineLimit = 80,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const logPath = getDependencyInstallLogPath(normalizeSandboxWorkingDir(workingDir));
    const output =
      (await this.runCommand(
        `if [ -f ${shellQuote(logPath)} ]; then tail -n ${Math.max(1, Math.floor(lineLimit))} ${shellQuote(logPath)}; fi`,
        abortSignal,
      )) || "";
    return output.trim();
  }

  private invalidateDependencyInstallStatus(workingDir: string, reason: string): void {
    const key = normalizeSandboxWorkingDir(workingDir);
    this.dependencyInstallStates.delete(key);
    logger.info(`[Sandbox] 清理失效依赖状态 workingDir=${key}: ${reason}`);
  }

  private async inspectDependencyArtifacts(workingDir: string): Promise<DependencyArtifactState> {
    const workingDirPath =
      `/sandbox/${workingDir === "." ? "" : workingDir}`.replace(/\/$/, "") || "/sandbox";
    const script = Buffer.from(
      [
        "const fs = require('fs');",
        "const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));",
        "const dependencyKeys = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];",
        "const dependencyCount = dependencyKeys.reduce((count, key) => count + Object.keys(pkg[key] || {}).length, 0);",
        "if (dependencyCount === 0) {",
        "  console.log('__AMIGO_DEP_STATE__:no_dependencies');",
        "} else if (fs.existsSync('node_modules')) {",
        "  console.log('__AMIGO_DEP_STATE__:installed');",
        "} else {",
        "  console.log('__AMIGO_DEP_STATE__:missing');",
        "}",
      ].join("\n"),
      "utf8",
    ).toString("base64");
    const output =
      (await this.runCommand(
        [
          `cd ${shellQuote(workingDirPath)}`,
          "if [ ! -f package.json ]; then",
          "  echo '__AMIGO_DEP_STATE__:no_package_json';",
          "else",
          `  node -e "$(printf '%s' ${shellQuote(script)} | base64 -d)"`,
          "fi",
        ].join("\n"),
      )) || "";
    const state = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith("__AMIGO_DEP_STATE__:"))
      ?.replace("__AMIGO_DEP_STATE__:", "") as DependencyArtifactState | undefined;

    if (!state) {
      throw new Error(`未能识别依赖产物状态: ${output.trim() || "<empty>"}`);
    }

    return state;
  }

  private async hydrateBootstrapRepository(
    branch: string,
    commitSha: string,
    repoUrl: string,
  ): Promise<void> {
    const commandLines = [
      `if [ ! -d ${shellQuote(BOOTSTRAP_REPO_MOUNT_PATH)} ]; then`,
      "  echo '__AMIGO_BOOTSTRAP_REPO_MISSING__';",
      "  exit 1;",
      "fi",
      "mkdir -p /sandbox",
      "if [ -d /sandbox/.git ]; then",
      "  exit 0;",
      "fi",
      'if [ -n "$(ls -A /sandbox 2>/dev/null)" ]; then',
      "  echo '__AMIGO_SANDBOX_NOT_EMPTY__';",
      "  exit 1;",
      "fi",
      `git clone ${shellQuote(BOOTSTRAP_REPO_MOUNT_PATH)} /sandbox`,
      "cd /sandbox",
      `git remote set-url origin ${shellQuote(repoUrl)}`,
    ];
    if (shouldConfigureGithubCredentialHelper(repoUrl)) {
      commandLines.push(
        'if [ -n "${GITHUB_TOKEN:-${GH_TOKEN:-}}" ]; then',
        `  ${buildGithubCredentialHelperCommand()}`,
        "fi",
      );
    }
    commandLines.push(`git checkout -B ${shellQuote(branch)} ${shellQuote(commitSha)}`);
    const command = commandLines.join("\n");

    const output = (await this.runCommand(command)) || "";
    if (output.includes("__AMIGO_BOOTSTRAP_REPO_MISSING__")) {
      throw new Error("预热仓库未挂载到 sandbox");
    }
    if (output.includes("__AMIGO_SANDBOX_NOT_EMPTY__")) {
      throw new Error("sandbox 工作目录非空，无法导入预热仓库");
    }
  }

  private async installDependencies(params: {
    workingDir: string;
    abortSignal?: AbortSignal;
  }): Promise<DependencyInstallStatus> {
    const plan = await this.detectDependencyInstallPlan(params.workingDir, params.abortSignal);

    if (plan.packageManager === "none" || !plan.installCommand) {
      const logPath = getDependencyInstallLogPath(params.workingDir);
      const status: DependencyInstallStatus = {
        status: "not_required",
        packageManager: "none",
        finishedAt: new Date().toISOString(),
        logPath,
      };
      this.dependencyInstallStates.set(params.workingDir, status);
      return { ...status };
    }

    const startedAt = new Date().toISOString();
    const logPath = getDependencyInstallLogPath(params.workingDir);
    this.dependencyInstallStates.set(params.workingDir, {
      status: "running",
      packageManager: plan.packageManager,
      startedAt,
      installCommand: plan.installCommand,
      logPath,
    });

    const workingDirPath =
      `/sandbox/${params.workingDir === "." ? "" : params.workingDir}`.replace(/\/$/, "") ||
      "/sandbox";
    const command = [
      `cd ${shellQuote(workingDirPath)}`,
      `export PNPM_STORE_DIR=${shellQuote(PNPM_STORE_CONTAINER_PATH)}`,
      `(${plan.installCommand}) >${shellQuote(logPath)} 2>&1`,
    ].join("\n");

    try {
      await this.runCommand(command, params.abortSignal);
      const status: DependencyInstallStatus = {
        status: "success",
        packageManager: plan.packageManager,
        startedAt,
        finishedAt: new Date().toISOString(),
        installCommand: plan.installCommand,
        logPath,
      };
      this.dependencyInstallStates.set(params.workingDir, status);
      return { ...status };
    } catch (error) {
      const logTail = await this.readDependencyInstallLogTail(params.workingDir, 80).catch(
        () => "",
      );
      const errorMessage = error instanceof Error ? error.message : String(error);
      const status: DependencyInstallStatus = {
        status: "failed",
        packageManager: plan.packageManager,
        startedAt,
        finishedAt: new Date().toISOString(),
        installCommand: plan.installCommand,
        logPath,
        error: logTail || errorMessage,
      };
      this.dependencyInstallStates.set(params.workingDir, status);
      throw new Error(logTail ? `依赖安装失败:\n${logTail}` : `依赖安装失败: ${errorMessage}`);
    }
  }

  private async runDependencyInstallCommand(params: {
    workingDir: string;
    installCommand: string;
    abortSignal?: AbortSignal;
  }): Promise<DependencyInstallStatus> {
    const startedAt = new Date().toISOString();
    const logPath = getDependencyInstallLogPath(params.workingDir);
    this.dependencyInstallStates.set(params.workingDir, {
      status: "running",
      packageManager: "custom",
      startedAt,
      installCommand: params.installCommand,
      logPath,
    });

    const workingDirPath =
      `/sandbox/${params.workingDir === "." ? "" : params.workingDir}`.replace(/\/$/, "") ||
      "/sandbox";
    const command = [
      `cd ${shellQuote(workingDirPath)}`,
      `export PNPM_STORE_DIR=${shellQuote(PNPM_STORE_CONTAINER_PATH)}`,
      `(${params.installCommand}) >${shellQuote(logPath)} 2>&1`,
    ].join("\n");

    try {
      await this.runCommand(command, params.abortSignal);
      const status: DependencyInstallStatus = {
        status: "success",
        packageManager: "custom",
        startedAt,
        finishedAt: new Date().toISOString(),
        installCommand: params.installCommand,
        logPath,
      };
      this.dependencyInstallStates.set(params.workingDir, status);
      return { ...status };
    } catch (error) {
      const logTail = await this.readDependencyInstallLogTail(params.workingDir, 80).catch(
        () => "",
      );
      const errorMessage = error instanceof Error ? error.message : String(error);
      const status: DependencyInstallStatus = {
        status: "failed",
        packageManager: "custom",
        startedAt,
        finishedAt: new Date().toISOString(),
        installCommand: params.installCommand,
        logPath,
        error: logTail || errorMessage,
      };
      this.dependencyInstallStates.set(params.workingDir, status);
      throw new Error(logTail ? `依赖安装失败:\n${logTail}` : `依赖安装失败: ${errorMessage}`);
    }
  }

  private async detectDependencyInstallPlan(
    workingDir: string,
    abortSignal?: AbortSignal,
  ): Promise<DependencyInstallPlan> {
    const workingDirPath =
      `/sandbox/${workingDir === "." ? "" : workingDir}`.replace(/\/$/, "") || "/sandbox";
    const output =
      (await this.runCommand(
        [
          `cd ${shellQuote(workingDirPath)}`,
          "if [ ! -f package.json ]; then",
          "  echo '__AMIGO_PM__:none';",
          "elif [ -f pnpm-lock.yaml ]; then",
          "  echo '__AMIGO_PM__:pnpm';",
          "elif [ -f package-lock.json ]; then",
          "  echo '__AMIGO_PM__:npm';",
          "elif [ -f yarn.lock ]; then",
          "  echo '__AMIGO_PM__:yarn';",
          "elif [ -f bun.lock ] || [ -f bun.lockb ]; then",
          "  echo '__AMIGO_PM__:bun';",
          "else",
          "  echo '__AMIGO_PM__:npm';",
          "fi",
        ].join("\n"),
        abortSignal,
      )) || "";

    const packageManager = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith("__AMIGO_PM__:"))
      ?.replace("__AMIGO_PM__:", "") as SupportedPackageManager | undefined;

    switch (packageManager || "none") {
      case "pnpm":
        return {
          packageManager: "pnpm",
          installCommand:
            "if command -v pnpm >/dev/null 2>&1; then pnpm install --prefer-offline; elif command -v corepack >/dev/null 2>&1; then corepack pnpm install --prefer-offline; else echo 'pnpm 不可用'; exit 127; fi",
        };
      case "npm":
        return {
          packageManager: "npm",
          installCommand: "npm install",
        };
      case "yarn":
        return {
          packageManager: "yarn",
          installCommand:
            "if command -v yarn >/dev/null 2>&1; then yarn install; elif command -v corepack >/dev/null 2>&1; then corepack yarn install; else echo 'yarn 不可用'; exit 127; fi",
        };
      case "bun":
        return {
          packageManager: "bun",
          installCommand: "bun install",
        };
      default:
        return {
          packageManager: "none",
        };
    }
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

  private async waitForPreviewReady(): Promise<void> {
    const deadline = Date.now() + PREVIEW_START_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (await this.isPreviewReachable()) {
        return;
      }
      await sleep(500);
    }

    const logTail = await this.readPreviewLogTail(80).catch(() => "");
    const suffix = logTail ? `\n\n最近日志：\n${logTail}` : "";
    throw new Error(
      `dev server 启动超时，预览入口未就绪（容器内端口 ${PREVIEW_CONTAINER_PORT}）${suffix}`,
    );
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

  private async isPreviewReachable(): Promise<boolean> {
    return (await this.findReachablePreviewHost()) !== null;
  }

  private async findReachablePreviewHost(): Promise<
    (typeof PREVIEW_HTTP_PROBE_HOSTS)[number] | null
  > {
    if (!this.previewHostPort) {
      return null;
    }

    for (const host of PREVIEW_HTTP_PROBE_HOSTS) {
      try {
        await withAbortableTimeout(PREVIEW_PROBE_TIMEOUT_MS, (signal) =>
          fetch(`http://${host}:${this.previewHostPort}`, {
            redirect: "manual",
            signal,
          }),
        );
        return host;
      } catch {}
    }

    const tcpReachable = await canConnectToPort(
      "127.0.0.1",
      this.previewHostPort,
      PREVIEW_PROBE_TIMEOUT_MS,
    );
    return tcpReachable ? "127.0.0.1" : null;
  }
}

export { normalizeEditorOpenFilePath } from "./editorFilePath";
export { getSandboxManager } from "./manager";
export { type ResolvedSandboxOptions, resolveSandboxOptions } from "./options";
export { SandboxRegistry, sandboxRegistry } from "./SandboxRegistry";
export type { SandboxManager, SandboxOptions } from "./types";
