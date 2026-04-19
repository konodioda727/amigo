import { getNextWorkflowPhase, type ToolInterface } from "@amigo-llm/types";
import type { ToolExecutionContext, ToolNames, ToolResult } from "@amigo-llm/types/src/tool";
import type { AmigoToolDefinition } from "@/core/model";
import { logger } from "@/utils/logger";
import { filterToolsForWorkflow, isToolAllowedForWorkflow } from "../workflow";
import { buildToolParametersSchema, normalizeToolCallParams } from "./toolParams";

type GenericTool = ToolInterface<any>;
type WorkflowToolScope = Pick<ToolExecutionContext, "currentPhase" | "agentRole">;

const resolveToolName = (toolName: string): string => toolName;

const getToolParameterDefinitions = (tool: GenericTool, _scope?: WorkflowToolScope) => {
  return tool.params;
};

type ToolDefinitionOptions = {
  includeWhenToUse?: boolean;
  includeParameterDescriptions?: boolean;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const buildWorkflowToolBlockedMessage = ({
  toolName,
  context,
}: {
  toolName: string;
  context: WorkflowToolScope;
}): string => {
  const currentPhase = context.currentPhase || "unknown";
  const agentRole = context.agentRole || "unknown";
  const nextPhase = context.currentPhase ? getNextWorkflowPhase(context.currentPhase) : undefined;
  const details = `currentPhase=${currentPhase}, agentRole=${agentRole}`;

  if (
    context.agentRole === "controller" &&
    context.currentPhase &&
    ["requirements", "design", "execution", "verification"].includes(context.currentPhase) &&
    toolName !== "finishPhase"
  ) {
    const transitionHint = nextPhase
      ? `调用 finishPhase 并显式填写 nextPhase=${nextPhase}，进入 ${nextPhase} 后再继续。`
      : "调用 finishPhase 并显式填写 nextPhase。";
    return `工具 '${toolName}' 在当前 workflow 阶段/角色不可用。${details}。请先完成当前阶段要求的工作；如果你判断当前阶段已经完成，${transitionHint}`;
  }

  return `工具 '${toolName}' 在当前 workflow 阶段/角色不可用。${details}。请先完成当前阶段允许的动作，再继续。`;
};

const unwrapToolInvokeResult = (
  invokeResult: unknown,
): {
  message: string;
  toolResult: unknown;
  continuationResult?: unknown;
  continuationSummary?: string;
  checkpointResult?: unknown;
  websocketData?: unknown;
  error?: string;
} => {
  if (!isPlainObject(invokeResult)) {
    return {
      message: "",
      toolResult: invokeResult,
    };
  }

  const transport = isPlainObject(invokeResult.transport) ? invokeResult.transport : null;
  const continuation = isPlainObject(invokeResult.continuation) ? invokeResult.continuation : null;
  if (transport) {
    return {
      message: typeof transport.message === "string" ? transport.message : "",
      toolResult: "result" in transport ? transport.result : undefined,
      ...(continuation && "result" in continuation
        ? { continuationResult: continuation.result }
        : {}),
      ...(continuation && typeof continuation.summary === "string"
        ? { continuationSummary: continuation.summary }
        : {}),
      ...(isPlainObject(invokeResult.checkpoint) && "result" in invokeResult.checkpoint
        ? { checkpointResult: invokeResult.checkpoint.result }
        : {}),
      ...(transport.websocketData !== undefined ? { websocketData: transport.websocketData } : {}),
      ...(typeof invokeResult.error === "string" ? { error: invokeResult.error } : {}),
    };
  }

  return {
    message: typeof invokeResult.message === "string" ? invokeResult.message : "",
    toolResult: "toolResult" in invokeResult ? invokeResult.toolResult : undefined,
    ...(invokeResult.continuationResult !== undefined
      ? { continuationResult: invokeResult.continuationResult }
      : {}),
    ...(typeof invokeResult.continuationSummary === "string"
      ? { continuationSummary: invokeResult.continuationSummary }
      : {}),
    ...(invokeResult.checkpointResult !== undefined
      ? { checkpointResult: invokeResult.checkpointResult }
      : {}),
    ...(invokeResult.websocketData !== undefined
      ? { websocketData: invokeResult.websocketData }
      : {}),
    ...(typeof invokeResult.error === "string" ? { error: invokeResult.error } : {}),
  };
};

export class ToolService {
  private _availableTools: Record<string, GenericTool> = {};
  private _baseTools: GenericTool[];
  private userDefinedTools: GenericTool[];

  constructor(baseTools: GenericTool[], userDefinedTools: GenericTool[]) {
    this._baseTools = this.deduplicateTools(baseTools);
    const baseToolNames = new Set(this._baseTools.map((tool) => tool.name));
    this.userDefinedTools = this.deduplicateTools(userDefinedTools).filter(
      (tool) => !baseToolNames.has(tool.name),
    );

    this._baseTools.concat(this.userDefinedTools).forEach((tool) => {
      this._availableTools[tool.name] = tool;
    });
  }

  private deduplicateTools(tools: GenericTool[]): GenericTool[] {
    const uniqueTools = new Map<string, GenericTool>();
    for (const tool of tools) {
      if (!uniqueTools.has(tool.name)) {
        uniqueTools.set(tool.name, tool);
      }
    }
    return Array.from(uniqueTools.values());
  }

  get toolNames() {
    return Object.keys(this._availableTools);
  }

  get baseTools() {
    return this._baseTools;
  }

  get customedTools() {
    return this.userDefinedTools;
  }

  public getAllTools() {
    return [...this._baseTools, ...this.userDefinedTools];
  }

  public getAllToolsForWorkflow(scope?: WorkflowToolScope): GenericTool[] {
    return filterToolsForWorkflow(this.getAllTools(), scope);
  }

  public getToolFromName(name: string, scope?: WorkflowToolScope): GenericTool | undefined {
    const tool = this._availableTools[resolveToolName(name)];
    if (!tool) {
      return undefined;
    }
    return isToolAllowedForWorkflow(tool, scope) ? tool : undefined;
  }

  public getToolDefinitions(
    scope?: WorkflowToolScope,
    options?: ToolDefinitionOptions,
  ): AmigoToolDefinition[] {
    return this.getAllToolsForWorkflow(scope).map((tool) => {
      const whenToUse = options?.includeWhenToUse === false ? "" : tool.whenToUse?.trim() || "";
      const paramDefinitions = getToolParameterDefinitions(tool, scope);
      return {
        name: tool.name,
        description: [tool.description, whenToUse].filter(Boolean).join("\n\n"),
        parameters: buildToolParametersSchema(paramDefinitions, {
          includeDescriptions: options?.includeParameterDescriptions !== false,
        }),
      };
    });
  }

  public async executeToolCall({
    toolName,
    params,
    context,
  }: {
    toolName: string;
    params: unknown;
    context: ToolExecutionContext;
  }): Promise<{
    message: string;
    params: Record<string, unknown> | string;
    toolResult: ToolResult<ToolNames>;
    continuationResult?: ToolResult<ToolNames>;
    continuationSummary?: string;
    checkpointResult?: ToolResult<ToolNames>;
    websocketData?: unknown;
    error?: string;
  }> {
    try {
      const resolvedToolName = resolveToolName(toolName || "");
      const tool = this._availableTools[resolvedToolName];
      if (!tool) {
        const errorMsg = `工具 '${toolName}' 不存在。请使用正确的工具名称。`;
        return {
          message: errorMsg,
          toolResult: "",
          params: {},
          error: errorMsg,
        };
      }

      if (
        !isToolAllowedForWorkflow(tool, {
          currentPhase: context.currentPhase,
          agentRole: context.agentRole,
        })
      ) {
        const errorMsg = buildWorkflowToolBlockedMessage({
          toolName,
          context: {
            currentPhase: context.currentPhase,
            agentRole: context.agentRole,
          },
        });
        return {
          message: errorMsg,
          toolResult: "",
          params: {},
          error: errorMsg,
        };
      }

      const normalizedParams = normalizeToolCallParams({
        toolName: resolvedToolName,
        params,
        paramDefinitions: tool.params,
      });
      const invokeResult = await tool.invoke({
        params: normalizedParams as never,
        context,
      });
      const {
        toolResult,
        message,
        continuationResult,
        continuationSummary,
        checkpointResult,
        websocketData,
        error,
      } = unwrapToolInvokeResult(invokeResult);
      logger.debug("[ToolService] 工具调用完成:", toolName, normalizedParams, toolResult);

      return {
        message,
        toolResult: toolResult as ToolResult<ToolNames>,
        ...(continuationResult !== undefined
          ? { continuationResult: continuationResult as ToolResult<ToolNames> }
          : {}),
        ...(typeof continuationSummary === "string" ? { continuationSummary } : {}),
        ...(checkpointResult !== undefined
          ? { checkpointResult: checkpointResult as ToolResult<ToolNames> }
          : {}),
        params: normalizedParams,
        websocketData,
        error,
      };
    } catch (err) {
      const errorMsg = `工具执行错误: ${err instanceof Error ? err.message : String(err)}`;
      logger.error("[ToolService] 工具执行异常:", err);
      return {
        message: errorMsg,
        toolResult: "",
        params: {},
        error: errorMsg,
      };
    }
  }
}
