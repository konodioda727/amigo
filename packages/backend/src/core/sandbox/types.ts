// biome-ignore lint/suspicious/noExplicitAny: SDK 允许注入兼容 sandbox 能力的任意对象
export interface SandboxManager<TSandbox = any> {
  get(parentId: string): TSandbox | undefined;
  getOrCreate(parentId: string): Promise<TSandbox>;
  has(parentId: string): boolean;
  destroy(parentId: string): Promise<void>;
  destroyAll?(): Promise<void>;
}

export interface SandboxOptions {
  imageName?: string;
  runtime?: string;
  memoryLimitBytes?: number;
}
