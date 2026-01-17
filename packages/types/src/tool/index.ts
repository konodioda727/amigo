import { z } from "zod";
import { AskFollowupQuestionSchema } from "./askFollowupQuestions";
import { TaskListSchema } from "./assingTasks";
import { BashSchema } from "./bash";
import { BrowserSearchSchema } from "./browserSearch";
import { CompletionResultSchema } from "./completionResult";
import type { ToolExecutionContext } from "./context";
import { EditFileSchema } from "./editFile";
import { ReadFileSchema } from "./readFile";
import {
  CreateTaskDocsSchema,
  GetTaskListProgressSchema,
  ReadTaskDocsSchema,
  UpdateTaskListSchema,
} from "./taskDocs";
import { TodoListSchema } from "./updateTodolist";

export type { ToolExecutionContext } from "./context";

export const toolSchemas = z.discriminatedUnion("name", [
  AskFollowupQuestionSchema,
  TaskListSchema,
  TodoListSchema,
  CompletionResultSchema,
  BrowserSearchSchema,
  CreateTaskDocsSchema,
  ReadTaskDocsSchema,
  UpdateTaskListSchema,
  GetTaskListProgressSchema,
  EditFileSchema,
  ReadFileSchema,
  BashSchema,
]);

export type ToolNames = z.infer<typeof toolSchemas>["name"];

export type ToolSchema = z.infer<typeof toolSchemas>;

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

// biome-ignore lint/suspicious/noExplicitAny: 用于工具集合的宽松类型
export interface ToolInterface<K extends ToolNames | any> {
  name: K extends ToolNames ? K : string;
  description: string;
  whenToUse: string;
  params: K extends ToolNames ? ToolParamDefinition<K>[] : ToolParamDefinition<string>[];
  useExamples: string[];

  invoke: (props: {
    params: K extends ToolNames ? ToolParams<K> : any;
    context: ToolExecutionContext;
  }) => Promise<{
    message: string;
    toolResult: K extends ToolNames ? ToolResult<K> : any;
  }>;
}

/**
 * 工具调用结果结构
 */
export interface TransportToolContent<T extends ToolNames> {
  toolName: ToolNames;
  result: ToolResult<T>;
  params: ToolParams<T>;
}
