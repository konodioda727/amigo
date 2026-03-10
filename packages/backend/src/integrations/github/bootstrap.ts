import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { StorageType, type TaskStatusMetadata } from "@amigo-llm/types";
import { conversationRepository } from "@/core/conversation";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";

const execFileAsync = promisify(execFile);
const INTERNAL_ROOT_DIR = ".amigo";
const GITHUB_BOOTSTRAP_DIR = "github-bootstrap";

export interface GithubBootstrapInput {
  repoUrl: string;
  branch?: string;
}

export interface GithubBootstrapSummary {
  repoUrl: string;
  repoName: string;
  branch: string;
  defaultBranch: string;
  commitSha: string;
  updatedAt: string;
}

interface GithubTaskBinding extends GithubBootstrapSummary {
  mirrorPath: string;
}

function getStorageRoot(): string {
  const storageRoot = getGlobalState("globalStoragePath");
  if (!storageRoot) {
    throw new Error("globalStoragePath 未配置");
  }
  return path.resolve(storageRoot);
}

function getBootstrapRoot(): string {
  return path.resolve(getStorageRoot(), "..", INTERNAL_ROOT_DIR, GITHUB_BOOTSTRAP_DIR);
}

function getMirrorRoot(): string {
  return path.join(getBootstrapRoot(), "mirrors");
}

function getTaskStatusPath(taskId: string): string {
  return path.join(getStorageRoot(), taskId, `${StorageType.TASK_STATUS}.json`);
}

function createRepoCacheKey(repoUrl: string): string {
  return Bun.hash(repoUrl.trim().toLowerCase()).toString(16);
}

function resolveMirrorPath(repoUrl: string): string {
  return path.join(getMirrorRoot(), `${createRepoCacheKey(repoUrl)}.git`);
}

function inferRepoName(repoUrl: string): string {
  const normalized = repoUrl.trim().replace(/\/+$/, "");
  const lastSegment = normalized.split(/[:/]/).filter(Boolean).at(-1) || "repo";
  return lastSegment.replace(/\.git$/i, "") || "repo";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractGithubInput(context: unknown): GithubBootstrapInput | null {
  if (!isPlainObject(context)) {
    return null;
  }

  const repoUrl = typeof context.repoUrl === "string" ? context.repoUrl.trim() : "";
  if (!repoUrl) {
    return null;
  }

  const branch = typeof context.branch === "string" ? context.branch.trim() : undefined;
  return {
    repoUrl,
    branch: branch || undefined,
  };
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runGit(args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    maxBuffer: 10 * 1024 * 1024,
  });
  return `${stdout || ""}${stderr || ""}`.trim();
}

async function ensureMirrorReady(repoUrl: string, mirrorPath: string): Promise<void> {
  await ensureDir(path.dirname(mirrorPath));

  if (await pathExists(mirrorPath)) {
    await runGit(["--git-dir", mirrorPath, "fetch", "--prune", "origin"]);
    return;
  }

  await runGit(["clone", "--mirror", repoUrl, mirrorPath]);
}

async function resolveDefaultBranch(mirrorPath: string): Promise<string> {
  try {
    const output = await runGit(["--git-dir", mirrorPath, "symbolic-ref", "--short", "HEAD"]);
    const branch = output.trim().replace(/^refs\/heads\//, "");
    if (branch) {
      return branch;
    }
  } catch (error) {
    logger.warn(`[githubBootstrap] mirror HEAD 不可用，回退到分支列表: ${error}`);
  }

  const refsOutput = await runGit([
    "--git-dir",
    mirrorPath,
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
  ]);
  const branches = refsOutput
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^refs\/heads\//, ""))
    .filter((branch) => branch && branch !== "HEAD");

  if (branches.length === 0) {
    throw new Error("无法解析仓库默认分支：远端没有可用分支");
  }

  const preferredBranch = ["main", "master", "dev", "develop", "trunk"].find((candidate) =>
    branches.includes(candidate),
  );

  const fallbackBranch = branches[0];
  if (!fallbackBranch) {
    throw new Error("无法解析仓库默认分支：远端没有可用分支");
  }

  return preferredBranch || fallbackBranch;
}

async function resolveCommitSha(mirrorPath: string, branch: string): Promise<string> {
  const output = await runGit([
    "--git-dir",
    mirrorPath,
    "rev-parse",
    "--verify",
    `refs/heads/${branch}^{commit}`,
  ]);
  const sha = output.trim().split(/\s+/)[0] || "";
  if (!sha) {
    throw new Error(`分支不存在或无法解析 commit: ${branch}`);
  }
  return sha;
}

async function resolveBinding(input: GithubBootstrapInput): Promise<GithubTaskBinding> {
  const repoUrl = input.repoUrl.trim();
  if (!repoUrl) {
    throw new Error("repoUrl 不能为空");
  }

  const mirrorPath = resolveMirrorPath(repoUrl);
  await ensureMirrorReady(repoUrl, mirrorPath);

  const requestedBranch = input.branch?.trim();
  const defaultBranch = requestedBranch || (await resolveDefaultBranch(mirrorPath));
  const branch = requestedBranch || defaultBranch;
  const commitSha = await resolveCommitSha(mirrorPath, branch);
  const updatedAt = new Date().toISOString();

  return {
    repoUrl,
    repoName: inferRepoName(repoUrl),
    branch,
    defaultBranch,
    commitSha,
    mirrorPath,
    updatedAt,
  };
}

export async function bootstrapGithubRepository(
  input: GithubBootstrapInput,
): Promise<GithubBootstrapSummary> {
  const binding = await resolveBinding(input);
  logger.info(
    `[githubBootstrap] repo=${binding.repoUrl} branch=${binding.branch} commit=${binding.commitSha}`,
  );

  const { mirrorPath: _mirrorPath, ...result } = binding;
  return result;
}

export async function cancelGithubBootstrapByRepo(_input: GithubBootstrapInput): Promise<boolean> {
  return true;
}

export async function bindGithubContextToTask(taskId: string, context: unknown): Promise<void> {
  const githubInput = extractGithubInput(context);
  if (!githubInput) {
    return;
  }

  const binding = await resolveBinding(githubInput);
  const boundContext = {
    ...(isPlainObject(context) ? context : {}),
    repoUrl: binding.repoUrl,
    repoName: binding.repoName,
    branch: binding.branch,
    defaultBranch: binding.defaultBranch,
    commitSha: binding.commitSha,
    updatedAt: binding.updatedAt,
  };

  const conversation = conversationRepository.get(taskId) || conversationRepository.load(taskId);
  if (!conversation) {
    throw new Error(`绑定仓库失败，task 不存在: ${taskId}`);
  }
  conversation.memory.setContext(boundContext);
  logger.info(`[githubBootstrap] 已绑定仓库到 task=${taskId}`);
}

export async function getGithubSandboxBindingForTask(
  taskId: string,
): Promise<Pick<GithubTaskBinding, "mirrorPath" | "branch" | "commitSha"> | null> {
  const taskStatusPath = getTaskStatusPath(taskId);
  if (!(await pathExists(taskStatusPath))) {
    return null;
  }

  try {
    const raw = await Bun.file(taskStatusPath).text();
    const metadata = JSON.parse(raw) as TaskStatusMetadata;
    const githubInput = extractGithubInput(metadata.context);
    if (!githubInput) {
      return null;
    }
    const commitSha =
      isPlainObject(metadata.context) && typeof metadata.context.commitSha === "string"
        ? metadata.context.commitSha.trim()
        : "";
    if (!commitSha) {
      logger.warn(`[githubBootstrap] task=${taskId} 缺少 commitSha，跳过仓库导入`);
      return null;
    }
    const branch =
      (isPlainObject(metadata.context) && typeof metadata.context.branch === "string"
        ? metadata.context.branch.trim()
        : "") ||
      (isPlainObject(metadata.context) && typeof metadata.context.defaultBranch === "string"
        ? metadata.context.defaultBranch.trim()
        : "");
    const mirrorPath = resolveMirrorPath(githubInput.repoUrl);
    if (!(await pathExists(mirrorPath))) {
      logger.warn(`[githubBootstrap] task=${taskId} mirror 不存在，跳过仓库导入`);
      return null;
    }
    return {
      mirrorPath,
      branch,
      commitSha,
    };
  } catch (error) {
    logger.warn(`[githubBootstrap] 读取 task=${taskId} 仓库绑定失败: ${error}`);
    return null;
  }
}
