import { z } from "zod";
import { AskFollowupQuestionSchema } from "./askFollowupQuestions";
import { TodoListSchema } from "./updateTodolist";
import { TaskListSchema } from "./assingTasks";
import { CompletionResultSchema } from "./completionResult";
import { BrowserSearchSchema } from "./browserSearch";

export const toolSchemas = z.discriminatedUnion("name", [
  AskFollowupQuestionSchema,
  TaskListSchema,
  TodoListSchema,
  CompletionResultSchema,
  BrowserSearchSchema,
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
 * 参数定义
 */
export interface ToolParam<K> {
  name: K extends ToolNames ? keyof ToolParams<K> : string;
  optional: boolean;
  description: string;
  type?: "string" | "array" | "object";
  params?: ToolParam<string>[];
}
/**
 * 工具接口
 */
export interface ToolInterface<K extends ToolNames> {
  name: K;
  description: string;
  whenToUse: string;
  params: ToolParam<K>[];
  useExamples: string[];

  // 调用函数：使用 Record<string, any> 作为参数类型
  invoke: (props: {
    params: ToolParams<K>;
    getCurrentTask: () => string;
    getToolFromName: (name: string) => ToolInterface<any> | undefined;
    signal?: AbortSignal;
    postMessage?: (msg: string | object) => void;
  }) => Promise<{ message: string; toolResult: ToolResult<K> }>;
}

/**
 * 工具调用结果结构
 */
export interface TransportToolContent<T extends ToolNames> {
  toolName: ToolNames;
  result: ToolResult<T>;
  params: ToolParam<T>;
}
