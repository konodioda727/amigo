import { z } from "zod";
import type { WorkflowAgentRole, WorkflowPhase } from "../workflow";
import { AskFollowupQuestionSchema } from "./askFollowupQuestions";
import { BashSchema } from "./bash";
import { BrowserSearchSchema } from "./browserSearch";
import { ChangePhaseSchema, OverridePhaseSchema } from "./changePhase";
import { CompleteTaskSchema } from "./completeTask";
import type { ToolExecutionContext } from "./context";
import {
  DesignDraftToolSchema,
  DesignOptionsToolSchema,
  DesignSessionToolSchema,
  OrchestrateFinalDesignDraftSchema,
  PatchLayoutOptionSourceSchema,
  ReadDesignSessionSchema,
  ReadDraftCritiqueSchema,
  ReadFinalDesignDraftSchema,
  ReadLayoutOptionsSchema,
  ReadModuleDraftsSchema,
  ReadThemeOptionsSchema,
  UpsertDesignSessionSchema,
  UpsertLayoutOptionsSchema,
  UpsertModuleDraftsSchema,
  UpsertThemeOptionsSchema,
} from "./designDraft";
import { EditFileSchema } from "./editFile";
import { ListFilesSchema } from "./listFiles";
import { ReadFileSchema } from "./readFile";
import { ReadRulesSchema } from "./readRules";
import { ReadRepoKnowledgeSchema, UpsertRepoKnowledgeSchema } from "./repoKnowledge";
import { SubmitTaskReviewSchema } from "./submitTaskReview";
import { TaskListSchema } from "./taskList";
import { UpdateDevServerSchema } from "./updateDevServer";

export type { ToolExecutionContext } from "./context";

export const toolSchemas = z.discriminatedUnion("name", [
  AskFollowupQuestionSchema,
  CompleteTaskSchema,
  OverridePhaseSchema,
  ChangePhaseSchema,
  BrowserSearchSchema,
  TaskListSchema,
  EditFileSchema,
  ListFilesSchema,
  ReadFileSchema,
  ReadRepoKnowledgeSchema,
  UpsertRepoKnowledgeSchema,
  ReadRulesSchema,
  DesignSessionToolSchema,
  DesignOptionsToolSchema,
  DesignDraftToolSchema,
  ReadDesignSessionSchema,
  UpsertDesignSessionSchema,
  ReadLayoutOptionsSchema,
  PatchLayoutOptionSourceSchema,
  UpsertLayoutOptionsSchema,
  ReadThemeOptionsSchema,
  UpsertThemeOptionsSchema,
  ReadFinalDesignDraftSchema,
  ReadModuleDraftsSchema,
  UpsertModuleDraftsSchema,
  OrchestrateFinalDesignDraftSchema,
  ReadDraftCritiqueSchema,
  BashSchema,
  SubmitTaskReviewSchema,
  UpdateDevServerSchema,
]);

export type ToolNames = z.infer<typeof toolSchemas>["name"];

export type ToolSchema = z.infer<typeof toolSchemas>;
export type {
  ChangePhaseParams,
  ChangePhaseResult,
  OverridePhaseParams,
  OverridePhaseResult,
} from "./changePhase";
export type { CompleteTaskWebsocketData } from "./completeTask";
export { CompleteTaskWebsocketDataSchema } from "./completeTask";
export type {
  DesignDraftParams,
  DesignDraftResult,
  DesignOptionsParams,
  DesignOptionsResult,
  DesignSessionParams,
  DesignSessionResult,
  OrchestrateFinalDesignDraftParams,
  OrchestrateFinalDesignDraftResult,
  PatchLayoutOptionSourceParams,
  PatchLayoutOptionSourceResult,
  ReadDesignSessionParams,
  ReadDesignSessionResult,
  ReadDraftCritiqueParams,
  ReadDraftCritiqueResult,
  ReadFinalDesignDraftParams,
  ReadFinalDesignDraftResult,
  ReadLayoutOptionsParams,
  ReadLayoutOptionsResult,
  ReadModuleDraftsParams,
  ReadModuleDraftsResult,
  ReadThemeOptionsParams,
  ReadThemeOptionsResult,
  UpsertDesignSessionParams,
  UpsertDesignSessionResult,
  UpsertLayoutOptionsParams,
  UpsertLayoutOptionsResult,
  UpsertModuleDraftsParams,
  UpsertModuleDraftsResult,
  UpsertThemeOptionsParams,
  UpsertThemeOptionsResult,
} from "./designDraft";
export type { ListFilesParams, ListFilesResult } from "./listFiles";
export type { ReadRulesParams, ReadRulesResult } from "./readRules";
export type {
  ReadRepoKnowledgeParams,
  ReadRepoKnowledgeResult,
  UpsertRepoKnowledgeParams,
  UpsertRepoKnowledgeResult,
} from "./repoKnowledge";
export type { SubmitTaskReviewParams, SubmitTaskReviewResult } from "./submitTaskReview";
export type { TaskListParams, TaskListResult } from "./taskList";
export type { UpdateDevServerParams, UpdateDevServerResult } from "./updateDevServer";

/**
 * 对应参数要求
 */
export type ToolParams<T extends ToolNames> = Extract<ToolSchema, { name: T }>["params"];

/** 对应返回结果要求
 */
export type ToolResult<T extends ToolNames> = Extract<ToolSchema, { name: T }>["result"];

/**
 * 工具参数定义（用于描述工具的参数结构）
 */
export interface ToolParamDefinition<K> {
  name: K extends ToolNames
    ? ToolParams<K> extends string
      ? string
      : keyof ToolParams<K>
    : string;
  optional: boolean;
  description: string;
  type?: "string" | "array" | "object";
  params?: ToolParamDefinition<string>[];
}

export type ToolCompletionBehavior = "continue" | "idle";
export type ToolExecutionMode = "sequential" | "parallel_readonly";

export interface ToolWorkflowScope {
  phases?: WorkflowPhase[];
  roles?: WorkflowAgentRole[];
}

export interface ToolWorkflowAccess extends ToolWorkflowScope {
  scopes?: ToolWorkflowScope[];
}

export interface ToolInterface<K extends ToolNames | any> {
  name: K extends ToolNames ? K : string;
  description: string;
  whenToUse?: string;
  completionBehavior?: ToolCompletionBehavior;
  executionMode?: ToolExecutionMode;
  workflow?: ToolWorkflowAccess;
  params: K extends ToolNames ? ToolParamDefinition<K>[] : ToolParamDefinition<string>[];

  invoke: (props: {
    params: K extends ToolNames ? ToolParams<K> : any;
    context: ToolExecutionContext;
  }) => Promise<{
    message: string;
    toolResult: K extends ToolNames ? ToolResult<K> : any;
    websocketData?: unknown;
    error?: string;
  }>;
}

/**
 * 工具调用结果结构
 */
export interface TransportToolContent<T extends ToolNames> {
  toolName: ToolNames;
  result: ToolResult<T>;
  params: ToolParams<T>;
  toolCallId?: string;
  websocketData?: unknown;
}
