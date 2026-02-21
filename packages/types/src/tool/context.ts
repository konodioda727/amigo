/**
 * 工具执行上下文
 * 传递给每个 tool 的 invoke 方法，包含当前会话的所有共享资源
 */
export interface ToolExecutionContext {
  /** 当前任务 ID */
  taskId: string;
  /** 父任务 ID（主任务为 undefined，用于获取共享资源如 sandbox） */
  parentId?: string;
  /** 获取当前会话的 sandbox（懒加载） */
  getSandbox: () => Promise<unknown>;
  /** 根据名称获取其他工具 */
  getToolByName: (name: string) => unknown;
  /** AbortSignal */
  signal?: AbortSignal;
  /** 发送消息回调 */
  postMessage?: (msg: string | object) => void;
}
