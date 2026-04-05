import { logger } from "@/utils/logger";

export type AsyncToolJobStatus = "running" | "completed" | "failed";

export interface AsyncToolJobInfo {
  id: string;
  key: string;
  toolName: string;
  taskId: string;
  status: AsyncToolJobStatus;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

interface AsyncToolJobRecord {
  info: AsyncToolJobInfo;
  promise: Promise<void>;
}

const createJobId = (toolName: string) =>
  `${toolName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export class AsyncToolJobRegistry {
  private runningJobs = new Map<string, AsyncToolJobRecord>();
  private latestJobs = new Map<string, AsyncToolJobInfo>();

  startOrJoin(params: {
    key: string;
    toolName: string;
    taskId: string;
    run: (job: AsyncToolJobInfo) => Promise<void>;
  }): { job: AsyncToolJobInfo; started: boolean; promise: Promise<void> } {
    const existing = this.runningJobs.get(params.key);
    if (existing) {
      return {
        job: existing.info,
        started: false,
        promise: existing.promise,
      };
    }

    const job: AsyncToolJobInfo = {
      id: createJobId(params.toolName),
      key: params.key,
      toolName: params.toolName,
      taskId: params.taskId,
      status: "running",
      startedAt: new Date().toISOString(),
    };

    const promise = Promise.resolve()
      .then(() => params.run(job))
      .then(() => {
        job.status = "completed";
        job.finishedAt = new Date().toISOString();
      })
      .catch((error) => {
        job.status = "failed";
        job.finishedAt = new Date().toISOString();
        job.error = error instanceof Error ? error.message : String(error);
        logger.error(`[AsyncToolJobRegistry] 后台任务失败: ${job.toolName}#${job.id}`, error);
      })
      .finally(() => {
        const current = this.runningJobs.get(params.key);
        if (current?.info.id === job.id) {
          this.runningJobs.delete(params.key);
        }
        this.latestJobs.set(params.key, { ...job });
      });

    this.runningJobs.set(params.key, { info: job, promise });
    this.latestJobs.set(params.key, { ...job });
    return { job, started: true, promise };
  }

  getRunning(key: string): AsyncToolJobInfo | null {
    return this.runningJobs.get(key)?.info || null;
  }

  getRunningPromise(key: string): Promise<void> | null {
    return this.runningJobs.get(key)?.promise || null;
  }

  getLatest(key: string): AsyncToolJobInfo | null {
    return this.runningJobs.get(key)?.info || this.latestJobs.get(key) || null;
  }

  listRunningByTaskId(taskId: string): AsyncToolJobInfo[] {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) {
      return [];
    }

    return Array.from(this.runningJobs.values())
      .map((record) => record.info)
      .filter((job) => job.taskId === normalizedTaskId);
  }
}

export const asyncToolJobRegistry = new AsyncToolJobRegistry();
