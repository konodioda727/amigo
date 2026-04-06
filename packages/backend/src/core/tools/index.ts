import type { ToolInterface } from "@amigo-llm/types";
import type {
  ToolExecutionContext,
  ToolNames,
  ToolParamDefinition,
  ToolResult,
} from "@amigo-llm/types/src/tool";
import type { AmigoToolDefinition } from "@/core/model";
import { getGlobalState } from "@/globalState";
import { ensureArray } from "@/utils/array";
import { logger } from "@/utils/logger";
import { AskFollowupQuestions } from "./askFollowupQuestions";
import { Bash } from "./bash";
import { BrowserSearch } from "./browserSearch";
import { CompleteTask } from "./completeTask";
import { EditFile } from "./editFile";
import { InstallDependencies } from "./installDependencies";
import { ReadFile } from "./readFile";
import { ExecuteTaskList, ReadTaskDocs, UpdateTaskDocs } from "./taskDocs/index";
import { UpdateDevServer } from "./updateDevServer";

type GenericTool = ToolInterface<any>;
type GenericToolParamDefinition = ToolParamDefinition<any>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const unwrapToolInvokeResult = (
  invokeResult: unknown,
): {
  message: string;
  toolResult: unknown;
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
  if (transport) {
    return {
      message: typeof transport.message === "string" ? transport.message : "",
      toolResult: "result" in transport ? transport.result : undefined,
      ...(transport.websocketData !== undefined ? { websocketData: transport.websocketData } : {}),
      ...(typeof invokeResult.error === "string" ? { error: invokeResult.error } : {}),
    };
  }

  return {
    message: typeof invokeResult.message === "string" ? invokeResult.message : "",
    toolResult: "toolResult" in invokeResult ? invokeResult.toolResult : undefined,
    ...(invokeResult.websocketData !== undefined
      ? { websocketData: invokeResult.websocketData }
      : {}),
    ...(typeof invokeResult.error === "string" ? { error: invokeResult.error } : {}),
  };
};

export class ToolService {
  private _availableTools: Record<string, GenericTool> = {};
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

  private _baseTools: GenericTool[];
  private userDefinedTools: GenericTool[];

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

  /**
   * 获取所有工具（包括基础工具和用户定义工具）
   */
  public getAllTools() {
    return [...this._baseTools, ...this.userDefinedTools];
  }

  /**
   * 根据名称获取工具
   */
  public getToolFromName(name: string): GenericTool | undefined {
    return this._availableTools[name];
  }

  /**
   * 生成供原生 Tool Call 使用的工具声明
   */
  public getToolDefinitions(): AmigoToolDefinition[] {
    return this.getAllTools().map((tool) => {
      const whenToUse = tool.whenToUse?.trim();
      return {
        name: tool.name,
        description: [tool.description, whenToUse].filter(Boolean).join("\n\n"),
        parameters: this.buildToolParametersSchema(tool),
      };
    });
  }

  /**
   * 执行原生 Tool Call（结构化参数）
   */
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
    websocketData?: unknown;
    error?: string;
  }> {
    try {
      const tool = this._availableTools[toolName || ""];
      if (!tool) {
        const errorMsg = `工具 '${toolName}' 不存在。请使用正确的工具名称。`;
        return {
          message: errorMsg,
          toolResult: "",
          params: {},
          error: errorMsg,
        };
      }

      const normalizedParams = this.normalizeToolCallParams(toolName, params, tool.params);
      const invokeResult = await tool.invoke({
        params: normalizedParams as never,
        context,
      });
      const { toolResult, message, websocketData, error } = unwrapToolInvokeResult(invokeResult);
      logger.debug("[ToolService] 工具调用完成:", toolName, normalizedParams, toolResult);

      return {
        message,
        toolResult: toolResult as ToolResult<ToolNames>,
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

  private inferParamType(param: GenericToolParamDefinition): "string" | "array" | "object" {
    if (param?.type === "string" || param?.type === "array" || param?.type === "object") {
      return param.type;
    }
    if (Array.isArray(param?.params) && param.params.length > 0) {
      return "object";
    }
    return "string";
  }

  private buildObjectSchemaFromParams(
    params: GenericToolParamDefinition[],
  ): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of params) {
      const type = this.inferParamType(param);
      properties[param.name] = this.buildSchemaForParamDefinition({
        ...param,
        type,
      });

      if (!param.optional) {
        required.push(param.name);
      }
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  private buildArrayItemsSchema(param: GenericToolParamDefinition): Record<string, unknown> {
    const children = Array.isArray(param?.params) ? param.params : [];
    if (children.length === 0) {
      return { type: "string" };
    }

    if (children.length === 1) {
      const child = children[0]!;
      const childType = this.inferParamType(child);

      if (childType === "string") {
        return {
          type: "string",
          ...(child.description ? { description: child.description } : {}),
        };
      }

      if (childType === "array") {
        return {
          type: "array",
          items: this.buildArrayItemsSchema(child),
          ...(child.description ? { description: child.description } : {}),
        };
      }

      if (Array.isArray(child.params) && child.params.length > 0) {
        return this.buildObjectSchemaFromParams(child.params);
      }
    }

    return this.buildObjectSchemaFromParams(children);
  }

  private buildSchemaForParamDefinition(
    param: GenericToolParamDefinition,
  ): Record<string, unknown> {
    const type = this.inferParamType(param);

    if (type === "array") {
      return {
        type: "array",
        items: this.buildArrayItemsSchema(param),
        ...(param.description ? { description: param.description } : {}),
      };
    }

    if (type === "object") {
      const nested = Array.isArray(param.params) ? param.params : [];
      const objectSchema = this.buildObjectSchemaFromParams(nested);
      return {
        ...objectSchema,
        ...(param.description ? { description: param.description } : {}),
      };
    }

    return {
      type: "string",
      ...(param.description ? { description: param.description } : {}),
    };
  }

  private buildToolParametersSchema(tool: GenericTool): Record<string, unknown> {
    const params = Array.isArray(tool.params) ? tool.params : [];
    if (params.length === 0) {
      return {
        type: "object",
        properties: {},
      };
    }
    return this.buildObjectSchemaFromParams(params);
  }

  private normalizeToolCallParams(
    toolName: string,
    params: unknown,
    paramDefinitions: GenericToolParamDefinition[],
  ): Record<string, unknown> | string {
    if (paramDefinitions.length === 0) {
      return {};
    }

    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw new Error(`工具 '${toolName}' 参数必须是对象`);
    }

    return this.mapAndValidateParams(params, paramDefinitions, false, toolName);
  }

  /**
   * 递归地根据 ToolParam 定义，从原始数据中提取、规范化和验证参数。
   * * 实现了：
   * 1. 结构映射：只提取 paramDefinitions 中定义的字段。
   * 2. 数组规范化：对 type="array" 的字段强制进行 ensureArray。
   * 3. 递归处理：处理嵌套结构。
   * * @param rawData - 原始的 JSON 数据块
   * @param paramDefinitions - 当前数据块对应的 ToolParam 定义数组
   * @returns 严格遵循 params 定义的规范化数据对象
   */
  private mapAndValidateParams(
    rawData: unknown,
    paramDefinitions: GenericToolParamDefinition[],
    partial = false,
    toolName = "",
  ): Record<string, unknown> {
    if (!rawData || typeof rawData !== "object") {
      logger.warn("[parseTool] data is not object");
    }

    const finalParams: Record<string, unknown> = {};
    const missingParams: string[] = [];
    const source =
      rawData && typeof rawData === "object" ? (rawData as Record<string, unknown>) : {};

    // 遍历所有期望的参数定义
    for (const paramDef of paramDefinitions) {
      const rawValue = source[paramDef.name];

      // 检查非可选参数的缺失
      if (!paramDef.optional && (rawValue === undefined || rawValue === null)) {
        if (partial) {
          // partial 情况下，缺失参数直接跳过
          continue;
        }
        missingParams.push(paramDef.name);
        continue;
      }

      // 如果字段缺失且是可选的，跳过
      if (rawValue === undefined) {
        continue;
      }

      // --- 1. 数组类型 (type: "array") ---
      if (paramDef.type === "array") {
        finalParams[paramDef.name] = this.normalizeArrayParam(
          rawValue,
          paramDef,
          partial,
          toolName,
        );
      }

      // --- 2. 对象类型 (type: "object" 或具有子标签的复杂结构) ---
      else if (Array.isArray(paramDef.params) && paramDef.params.length > 0) {
        // 递归处理子对象
        finalParams[paramDef.name] = this.mapAndValidateParams(rawValue, paramDef.params, partial);
      }

      // --- 3. 基本类型 (string, number, boolean) ---
      else {
        // 直接赋值，只保留 params 定义的字段 (实现了过滤)
        finalParams[paramDef.name] = rawValue;
      }
    }

    // 检查是否有缺失的必需参数
    if (missingParams.length > 0 && !partial) {
      throw new Error(
        `工具 '${toolName}' 缺少必需参数: ${missingParams.join(", ")}。请按照工具定义的格式提供所有必需参数。`,
      );
    }

    return finalParams;
  }

  private normalizeArrayParam(
    rawValue: unknown,
    paramDef: GenericToolParamDefinition,
    partial: boolean,
    toolName: string,
  ): unknown[] {
    const childDefs = Array.isArray(paramDef?.params) ? paramDef.params : [];
    if (childDefs.length !== 1) {
      if (!partial) {
        throw new Error(
          `工具 '${toolName}' 的数组参数 '${paramDef?.name}' 定义无效：必须有且仅有一个子参数定义。`,
        );
      }
      return [];
    }

    const childDef = childDefs[0]!;
    const unwrapLegacyChild = (item: unknown): unknown => {
      if (
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof childDef?.name === "string" &&
        Object.hasOwn(item, childDef.name) &&
        Object.keys(item as Record<string, unknown>).length === 1
      ) {
        return (item as Record<string, unknown>)[childDef.name];
      }
      return item;
    };

    const sourceArray = Array.isArray(rawValue)
      ? rawValue
      : ensureArray(
          rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
            ? (rawValue as Record<string, unknown>)[childDef.name]
            : rawValue,
        );

    if (Array.isArray(childDef.params) && childDef.params.length > 0) {
      return sourceArray.map((item) =>
        this.mapAndValidateParams(unwrapLegacyChild(item), childDef.params!, partial, toolName),
      );
    }

    return sourceArray.map((item) => unwrapLegacyChild(item));
  }
}

const _SHARED_BASIC_TOOLS: GenericTool[] = [
  BrowserSearch,
  EditFile,
  ReadFile,
  Bash,
  InstallDependencies,
  UpdateTaskDocs,
  ReadTaskDocs,
  UpdateDevServer,
];

export const DEFAULT_MAIN_BASIC_TOOLS: GenericTool[] = [
  AskFollowupQuestions,
  CompleteTask,
  BrowserSearch,
  EditFile,
  ReadFile,
  Bash,
  InstallDependencies,
  UpdateTaskDocs,
  ReadTaskDocs,
  ExecuteTaskList,
  UpdateDevServer,
];

export const DEFAULT_SUB_BASIC_TOOLS: GenericTool[] = [
  BrowserSearch,
  EditFile,
  ReadFile,
  Bash,
  InstallDependencies,
  UpdateTaskDocs,
  ReadTaskDocs,
  CompleteTask,
  UpdateDevServer,
];

export const getBaseTools = (type: "main" | "sub"): GenericTool[] => {
  const configuredBaseTools = getGlobalState("baseTools")?.[type];
  if (configuredBaseTools) {
    return [...configuredBaseTools];
  }

  return type === "main" ? DEFAULT_MAIN_BASIC_TOOLS : DEFAULT_SUB_BASIC_TOOLS;
};

export const CUSTOMED_TOOLS: GenericTool[] = [];

export {
  AskFollowupQuestions,
  CompleteTask,
  BrowserSearch,
  EditFile,
  ReadFile,
  Bash,
  InstallDependencies,
  UpdateTaskDocs,
  ReadTaskDocs,
  ExecuteTaskList,
  UpdateDevServer,
};
