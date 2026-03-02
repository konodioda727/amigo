import type { ToolInterface } from "@amigo-llm/types";
import { systemReservedTags } from "@amigo-llm/types";
import type { ToolExecutionContext, ToolNames, ToolResult } from "@amigo-llm/types/src/tool";
import type { AmigoToolDefinition } from "@/core/model";
import { ensureArray } from "@/utils/array";
import { logger } from "@/utils/logger";
import { AskFollowupQuestions } from "./askFollowupQuestions";
import { Bash } from "./bash";
import { BrowserSearch } from "./browserSearch";
import { CompleteTask } from "./completeTask";
import { CompletionResult } from "./completionResult";
import { EditFile } from "./editFile";
import { ReadFile } from "./readFile";
import {
  CreateTaskDocs,
  ExecuteTaskList,
  GetTaskListProgress,
  ReadTaskDocs,
} from "./taskDocs/index";

export class ToolService {
  // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
  private _availableTools: Record<string, ToolInterface<any>> = {};
  constructor(
    // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
    private _baseTools: ToolInterface<any>[],
    // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
    private userDefinedTools: ToolInterface<any>[],
  ) {
    this._baseTools.concat(this.userDefinedTools).forEach((tool) => {
      this._availableTools[tool.name] = tool;
    });
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
  // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
  public getToolFromName(name: string): ToolInterface<any> | undefined {
    return this._availableTools[name];
  }

  /**
   * 生成供原生 Tool Call 使用的工具声明
   */
  public getToolDefinitions(): AmigoToolDefinition[] {
    return this.getAllTools().map((tool) => ({
      name: tool.name,
      description: `${tool.description}\n\n${tool.whenToUse}`.trim(),
      parameters: this.buildToolParametersSchema(tool),
    }));
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
      const { toolResult, message } = await tool.invoke({
        params: normalizedParams as never,
        context,
      });
      logger.debug("[ToolService] 工具调用完成:", toolName, normalizedParams, toolResult);

      return { message, toolResult, params: normalizedParams };
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

  /**
   * 解析 XML 并自动调用所有工具
   */
  public async parseAndExecute({
    xmlParams: _xmlParams,
    context: _context,
  }: {
    xmlParams: string;
    context: ToolExecutionContext;
  }): Promise<{
    message: string;
    params: Record<string, unknown> | string;
    toolResult: ToolResult<ToolNames>;
    error?: string;
  }> {
    const error =
      "XML tool-call path has been removed. Use native structured tool call via executeToolCall().";
    return {
      message: error,
      params: {},
      toolResult: "",
      error,
    };
  }

  private inferParamType(param: any): "string" | "array" | "object" {
    if (param?.type === "string" || param?.type === "array" || param?.type === "object") {
      return param.type;
    }
    if (Array.isArray(param?.params) && param.params.length > 0) {
      return "object";
    }
    return "string";
  }

  private buildObjectSchemaFromParams(params: any[]): Record<string, unknown> {
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
      additionalProperties: false,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  private buildArrayItemsSchema(param: any): Record<string, unknown> {
    const children = Array.isArray(param?.params) ? param.params : [];
    if (children.length === 0) {
      return { type: "string" };
    }

    if (children.length === 1) {
      const child = children[0];
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

  private buildSchemaForParamDefinition(param: any): Record<string, unknown> {
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

  private buildToolParametersSchema(tool: ToolInterface<any>): Record<string, unknown> {
    const params = Array.isArray(tool.params) ? tool.params : [];
    if (params.length === 0) {
      return {
        type: "object",
        properties: {},
        additionalProperties: false,
      };
    }
    return this.buildObjectSchemaFromParams(params);
  }

  private normalizeToolCallParams(
    toolName: string,
    params: unknown,
    paramDefinitions: any[],
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
   * 从 params 定义中递归收集所有叶子节点（基本类型参数）的路径
   * 用于配置 XMLParser 的 stopNodes，防止 HTML 标签被错误解析
   */
  private collectLeafNodePaths(paramDefs: any[], prefix: string): string[] {
    const paths: string[] = [];
    for (const param of paramDefs) {
      const currentPath = prefix ? `${prefix}.${param.name}` : param.name;
      // 如果没有子 params，说明是叶子节点（基本类型）
      if (!param.params || param.params.length === 0) {
        paths.push(`*.${param.name}`); // 使用通配符匹配任意层级
      } else {
        // 递归处理子参数
        paths.push(...this.collectLeafNodePaths(param.params, currentPath));
      }
    }
    return paths;
  }

  /**
   * 从所有工具的 params 定义中递归收集所有参数标签名
   * 用于 completePartialXml 补全未闭合的参数标签
   */
  private collectAllParamTagNames(): string[] {
    const tagNames = new Set<string>();

    const collectFromParams = (params: any[]) => {
      for (const param of params) {
        tagNames.add(param.name);
        if (param.params && param.params.length > 0) {
          collectFromParams(param.params);
        }
      }
    };

    for (const tool of Object.values(this._availableTools)) {
      if (tool.params) {
        collectFromParams(tool.params);
      }
    }

    return [...tagNames];
  }

  public parseParams(
    _buffer: string,
    _partial = false,
  ): {
    params: Record<string, unknown> | string;
    toolName: string;
    error?: string;
  } {
    const error =
      "XML tool-call path has been removed. Use native structured tool call via executeToolCall().";
    return {
      params: {},
      toolName: "",
      error,
    };
  }

  /**
   * 补全不完整的 XML 字符串。
   * @param xmlString 不完整的 XML 字符串，例如 "<ask_question><a>123"
   * @returns 补全后的 XML 字符串，例如 "<ask_question><a>123</a></ask_question>"
   */
  private completePartialXml(xmlString: string): string {
    let processedString = xmlString;

    // 步骤 0: 检测并处理不完整的 CDATA
    const cdataStartPattern = /<!\[CDATA\[/g;
    const cdataEndPattern = /\]\]>/g;
    let cdataStartCount = 0;
    let cdataEndCount = 0;

    // 计算 CDATA 开始和结束标签的数量
    let match = cdataStartPattern.exec(processedString);
    while (match !== null) {
      cdataStartCount++;
      match = cdataStartPattern.exec(processedString);
    }

    match = cdataEndPattern.exec(processedString);
    while (match !== null) {
      cdataEndCount++;
      match = cdataEndPattern.exec(processedString);
    }

    // 如果有未闭合的 CDATA，找到最后一个 <![CDATA[ 并移除它之后的所有内容
    if (cdataStartCount > cdataEndCount) {
      const lastCdataStart = processedString.lastIndexOf("<![CDATA[");
      if (lastCdataStart > -1) {
        processedString = processedString.substring(0, lastCdataStart);
      }
    }

    // 步骤 1: 检测并移除末尾可能存在的任何部分标签
    const lastOpenBracketIndex = processedString.lastIndexOf("<");
    const lastCloseBracketIndex = processedString.lastIndexOf(">");
    // 如果最后一个 '<' 在最后一个 '>' 之后，说明有一个未闭合的标签
    // 例如: "...<think>some thoughts</thi"
    if (lastOpenBracketIndex > -1 && lastOpenBracketIndex > lastCloseBracketIndex) {
      processedString = processedString.substring(0, lastOpenBracketIndex);
    }

    // 收集所有需要补全的标签：系统保留标签 + 工具名 + 工具参数标签
    const allTags = [...systemReservedTags, ...this.toolNames, ...this.collectAllParamTagNames()];
    if (allTags.length === 0) {
      return processedString;
    }

    const tagPattern = allTags.join("|");
    const tagRegex = new RegExp(`<(${tagPattern})\\b[^>]*>|<\\/(${tagPattern})>`, "g");

    const openTags: string[] = [];
    let tagMatch: RegExpExecArray | null;

    // 遍历所有完整的标签，维护一个开放标签的栈
    while ((tagMatch = tagRegex.exec(processedString)) !== null) {
      if (tagMatch[1]) {
        openTags.push(tagMatch[1]);
      } else if (tagMatch[2]) {
        // 如果栈顶是对应的开始标签，则出栈
        if (openTags.length > 0 && openTags[openTags.length - 1] === tagMatch[2]) {
          openTags.pop();
        }
      }
    }

    let completedString = processedString;
    while (openTags.length > 0) {
      const tagToClose = openTags.pop();
      if (tagToClose) {
        completedString += `</${tagToClose}>`;
      }
    }

    return completedString;
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
    rawData: any,
    paramDefinitions: any[],
    partial = false,
    toolName = "",
  ): Record<string, any> {
    if (!rawData || typeof rawData !== "object") {
      logger.warn("[parseTool] data is not object");
    }

    const finalParams: Record<string, any> = {};
    const missingParams: string[] = [];

    // 遍历所有期望的参数定义
    for (const paramDef of paramDefinitions) {
      const rawValue = rawData[paramDef.name];

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
      else if (paramDef.params) {
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
    paramDef: any,
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

    const childDef = childDefs[0];
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

    if (Array.isArray(childDef?.params) && childDef.params.length > 0) {
      return sourceArray.map((item) =>
        this.mapAndValidateParams(unwrapLegacyChild(item), childDef.params, partial, toolName),
      );
    }

    return sourceArray.map((item) => unwrapLegacyChild(item));
  }
}

export const MAIN_BASIC_TOOLS: ToolInterface<any>[] = [
  AskFollowupQuestions,
  CompletionResult,
  CompleteTask,
  BrowserSearch,
  EditFile,
  ReadFile,
  Bash,
  CreateTaskDocs,
  ReadTaskDocs,
  ExecuteTaskList,
  GetTaskListProgress,
];

export const SUB_BASIC_TOOLS: ToolInterface<any>[] = [
  BrowserSearch,
  EditFile,
  ReadFile,
  Bash,
  CreateTaskDocs,
  ReadTaskDocs,
  CompleteTask,
];

// biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
export const CUSTOMED_TOOLS: ToolInterface<any>[] = [];

export {
  AskFollowupQuestions,
  CompletionResult,
  CompleteTask,
  BrowserSearch,
  EditFile,
  ReadFile,
  Bash,
  CreateTaskDocs,
  ReadTaskDocs,
  GetTaskListProgress,
  ExecuteTaskList,
};
