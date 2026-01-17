import { z } from "zod";

/**
 * 工作流阶段枚举
 * 定义主 Agent 处理复杂任务时的标准化工作流程阶段
 */
export enum WorkflowPhase {
  /** 初始状态 - 等待用户请求 */
  IDLE = "idle",
  /** 需求分析阶段 - 分析用户意图并创建需求文档 */
  ANALYZE = "analyze",
  /** 设计阶段 - 收集信息并创建设计文档 */
  DESIGN = "design",
  /** 任务拆分阶段 - 将设计分解为可执行的任务列表 */
  BREAKDOWN = "breakdown",
  /** 执行阶段 - 执行任务并验证结果 */
  EXECUTE = "execute",
  /** 完成状态 - 所有任务已完成 */
  COMPLETE = "complete",
}

/**
 * 工作流阶段 Zod Schema
 * 用于运行时验证
 */
export const WorkflowPhaseSchema = z.nativeEnum(WorkflowPhase);

/**
 * 任务文档类型
 */
export type TaskDocumentType = "requirements" | "design" | "taskList";

/**
 * 任务文档类型 Zod Schema
 */
export const TaskDocumentTypeSchema = z.enum(["requirements", "design", "taskList"]);

/**
 * 任务上下文接口
 * 存储当前任务的工作流状态和相关文档
 */
export interface TaskContext {
  /** 任务唯一标识 */
  taskId: string;
  /** 任务名称 (kebab-case 格式) */
  taskName: string;
  /** 当前工作流阶段 */
  currentPhase: WorkflowPhase;
  /** 文档存储路径 (docs/{task-name}/) */
  docsPath: string;
  /** 已创建的文档内容 */
  documents: {
    /** 需求文档内容 */
    requirements?: string;
    /** 设计文档内容 */
    design?: string;
    /** 任务列表文档内容 */
    taskList?: string;
  };
  /** 是否为简单任务（可跳过完整工作流） */
  isSimpleTask: boolean;
}

/**
 * 任务上下文 Zod Schema
 * 用于运行时验证
 */
export const TaskContextSchema = z.object({
  taskId: z.string(),
  taskName: z.string(),
  currentPhase: WorkflowPhaseSchema,
  docsPath: z.string(),
  documents: z.object({
    requirements: z.string().optional(),
    design: z.string().optional(),
    taskList: z.string().optional(),
  }),
  isSimpleTask: z.boolean(),
});

/**
 * 工作流阶段转换规则
 * 定义合法的阶段转换路径
 */
export const WORKFLOW_PHASE_TRANSITIONS: Record<WorkflowPhase, WorkflowPhase[]> = {
  [WorkflowPhase.IDLE]: [WorkflowPhase.ANALYZE],
  [WorkflowPhase.ANALYZE]: [WorkflowPhase.DESIGN],
  [WorkflowPhase.DESIGN]: [WorkflowPhase.BREAKDOWN],
  [WorkflowPhase.BREAKDOWN]: [WorkflowPhase.EXECUTE],
  [WorkflowPhase.EXECUTE]: [WorkflowPhase.COMPLETE],
  [WorkflowPhase.COMPLETE]: [], // 终态，无后续转换
};

/**
 * 检查阶段转换是否合法
 * @param from 当前阶段
 * @param to 目标阶段
 * @returns 是否为合法转换
 */
export function isValidPhaseTransition(from: WorkflowPhase, to: WorkflowPhase): boolean {
  return WORKFLOW_PHASE_TRANSITIONS[from].includes(to);
}

/**
 * 获取阶段对应的文档类型
 * @param phase 工作流阶段
 * @returns 该阶段需要创建的文档类型，如果不需要创建文档则返回 undefined
 */
export function getPhaseDocument(phase: WorkflowPhase): TaskDocumentType | undefined {
  switch (phase) {
    case WorkflowPhase.ANALYZE:
      return "requirements";
    case WorkflowPhase.DESIGN:
      return "design";
    case WorkflowPhase.BREAKDOWN:
      return "taskList";
    default:
      return undefined;
  }
}

/**
 * 获取阶段的前置文档要求
 * @param phase 工作流阶段
 * @returns 进入该阶段前必须存在的文档类型列表
 */
export function getPhasePrerequisites(phase: WorkflowPhase): TaskDocumentType[] {
  switch (phase) {
    case WorkflowPhase.DESIGN:
      return ["requirements"];
    case WorkflowPhase.BREAKDOWN:
      return ["requirements", "design"];
    case WorkflowPhase.EXECUTE:
      return ["requirements", "design", "taskList"];
    default:
      return [];
  }
}
