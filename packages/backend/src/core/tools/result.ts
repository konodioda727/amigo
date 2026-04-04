import type { ToolInvokeResult, ToolNames, ToolResult } from "@amigo-llm/types/src/tool";

type ToolValue<K extends string> = K extends ToolNames ? ToolResult<K> : unknown;

type CreateToolResultOptions<K extends string> = {
  transportMessage?: string;
  continuationSummary?: string;
  continuationResult?: ToolValue<K>;
  websocketData?: unknown;
  checkpointResult?: ToolValue<K>;
  error?: string;
};

export const createToolResult = <K extends string>(
  transportResult: ToolValue<K>,
  options: CreateToolResultOptions<K> = {},
): ToolInvokeResult<K> => ({
  transport: {
    ...(typeof options.transportMessage === "string" ? { message: options.transportMessage } : {}),
    result: transportResult,
    ...(options.websocketData !== undefined ? { websocketData: options.websocketData } : {}),
  },
  continuation: {
    result: options.continuationResult ?? transportResult,
    ...(typeof options.continuationSummary === "string"
      ? { summary: options.continuationSummary }
      : {}),
  },
  ...(options.checkpointResult !== undefined
    ? {
        checkpoint: {
          result: options.checkpointResult,
        },
      }
    : {}),
  ...(typeof options.error === "string" ? { error: options.error } : {}),
});

export const createToolErrorResult = <K extends string>(
  transportResult: ToolValue<K>,
  error: string,
  options: Omit<CreateToolResultOptions<K>, "error"> = {},
): ToolInvokeResult<K> =>
  createToolResult(transportResult, {
    ...options,
    error,
  });
