import type { WorkflowAgentRole, WorkflowPhase, WorkflowState } from "../workflow";
import type { ToolInterface } from "./index";

/**
 * 工具执行上下文
 * 传递给每个 tool 的 invoke 方法，包含当前会话的所有共享资源
 */
export interface ToolExecutionContext {
  /** 当前任务 ID */
  taskId: string;
  /** 父任务 ID（controller 根任务为 undefined，用于获取共享资源如 sandbox） */
  parentId?: string;
  /** 当前会话上下文 */
  conversationContext?: unknown;
  /** 当前工作流状态 */
  workflowState?: WorkflowState;
  /** 当前工作流阶段 */
  currentPhase?: WorkflowPhase;
  /** 当前工作流运行角色 */
  agentRole?: WorkflowAgentRole;
  /** 获取当前会话的 sandbox（懒加载） */
  getSandbox: () => Promise<unknown>;
  /** 获取语言运行时宿主（懒加载） */
  getLanguageRuntimeHost?: () => Promise<unknown>;
  /** 根据名称获取其他工具 */
  getToolByName: (name: string) => ToolInterface<string> | undefined;
  /** AbortSignal */
  signal?: AbortSignal;
  /** 发送消息回调 */
  postMessage?: (msg: string | object) => void;
  /** 发送结构化工具进度，复用当前 tool call 的传输通道 */
  postToolUpdate?: (update: {
    message?: string;
    websocketData?: unknown;
    result?: unknown;
    error?: string;
  }) => void;
}
