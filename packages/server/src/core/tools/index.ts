import type { ToolInterface, ToolResult } from "@amigo/types/src/tool";
import { XMLParser } from "fast-xml-parser";
import { systemReservedTags } from "@amigo/types";
import { ensureArray } from "@/utils/array";
import { logger } from "@/utils/logger";
import { AskFollowupQuestions } from "./askFollowupQuestions";
import { UpdateTodolist } from "./todolist";
import { CompletionResult } from "./completionResult";
import { AssignTasks } from "./assignTasks";
import { BrowserSearch } from "./browserSearch";

export class ToolService {
  private _availableTools: Record<string, ToolInterface<any>> = {};
  constructor(
    private _baseTools: ToolInterface<any>[],
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
  public getToolFromName(name: string): ToolInterface<any> | undefined {
    return this._availableTools[name];
  }

  /**
   * 解析 XML 并自动调用所有工具
   */
  public async parseAndExecute({
    xmlParams,
    getCurrentTask,
    signal,
    postMessage,
  }: {
    xmlParams: string;
    getCurrentTask: () => string;
    signal?: AbortSignal;
    postMessage?: (msg: string | object) => void;
  }): Promise<{ message: string; params: Record<string, any> | string; toolResult: ToolResult<any>; error?: string }> {
    try {
      const { params, toolName, error } = this.parseParams(xmlParams);
      
      // If there's a parsing error, return it
      if (error) {
        logger.error("[ToolService] 工具参数解析错误:", error);
        return {
          message: error,
          toolResult: "",
          params,
          error,
        };
      }
      
      const tool = this._availableTools[toolName || ""];
      if (!tool) {
        const errorMsg = `工具 '${toolName}' 不存在。请使用正确的工具名称。`;
        return {
          message: errorMsg,
          toolResult: "",
          params,
          error: errorMsg,
        };
      }
      
      const { toolResult, message } = await tool.invoke({
        params: params as any,
        getCurrentTask,
        getToolFromName: (name: string) => this._availableTools[name],
        ...(signal ? { signal } : {}),
        ...(postMessage ? { postMessage } : {}),
      });
      logger.debug("[ToolService] 工具调用完成:", toolName, params, toolResult);

      return { message, toolResult, params };
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
   * 从 params 定义中递归收集所有叶子节点（基本类型参数）的路径
   * 用于配置 XMLParser 的 stopNodes，防止 HTML 标签被错误解析
   */
  private collectLeafNodePaths(
    paramDefs: any[],
    prefix: string,
  ): string[] {
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
    buffer: string,
    partial = false,
  ): {
    params: Record<string, any> | string;
    toolName: string;
    error?: string;
  } {
    try {
      const completedXml = this.completePartialXml(buffer);
      
      // 先用简单解析获取工具名
      const simpleParser = new XMLParser({ ignoreAttributes: true });
      const preParseResult = simpleParser.parse(completedXml);
      const toolName = Object.keys(preParseResult).find((key) => this._availableTools[key]) || "";
      const tool = this._availableTools[toolName];
      
      if (!tool) {
        const firstKey = Object.keys(preParseResult)[0] || "";
        if (!partial) {
          logger.warn(`[parseTool] 未找到名为 '${toolName || firstKey}' 的工具。`);
        }
        return {
          params: {},
          toolName: toolName || firstKey,
        };
      }
      
      // 收集所有叶子节点路径作为 stopNodes，防止内容中的 HTML 标签被解析
      // 如果 params 为空，则将工具名本身作为 stopNode
      const hasParams = tool.params.length !== 0;
      const stopNodes = hasParams
        ? this.collectLeafNodePaths(tool.params, toolName)
        : [toolName];
      
      const parser = new XMLParser({
        ignoreAttributes: false,
        trimValues: true,
        stopNodes,
      });
      const jsonOutput = parser.parse(completedXml);
      
      const finalParams = hasParams
        ? this.mapAndValidateParams(jsonOutput[toolName], tool.params, partial, toolName)
        : String(jsonOutput[toolName]);
        
      return { params: finalParams, toolName };
    } catch (err) {
      const errorMsg = `XML 解析错误: ${err instanceof Error ? err.message : String(err)}`;
      logger.error("[parseParams] 解析失败:", err);
      return {
        params: {},
        toolName: "",
        error: errorMsg,
      };
    }
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
      const lastCdataStart = processedString.lastIndexOf('<![CDATA[');
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
      if (paramDef.type === "array" && !Array.isArray(rawValue)) {
        // 如果为数组类型，则 params 定义中必须有且仅有一个子定义
        if (paramDef.params.length !== 1) {
          logger.warn(
            `[parseTool] Array type param '${paramDef.name}' should have exactly one child definition.`,
          );
          continue;
        }
        if (Object.keys(rawValue).length !== 1) {
          const errorMsg = `Array type param '${paramDef.name}' should have exactly one child element instance named ${paramDef.params[0]?.name}.`;
          if (!partial) {
            logger.warn(`\n[parseTool] ${errorMsg}`);
            missingParams.push(errorMsg);
          }
          finalParams[paramDef.name] = [];
          continue;
        }
        const childTag = paramDef.params[0];
        const childTagName = childTag?.name;
        const rawArray = ensureArray(rawValue[childTagName]);

        // 如果数组元素有更深层次的定义, 递归处理数组中的每个元素
        if (childTag.params && childTag.params.length > 0) {
          finalParams[paramDef.name] = rawArray.map((item: any) =>
            this.mapAndValidateParams(item, childTag.params, partial),
          );
        } else {
          finalParams[paramDef.name] = rawArray;
        }
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
        `工具 '${toolName}' 缺少必需参数: ${missingParams.join(", ")}。请按照工具定义的格式提供所有必需参数。`
      );
    }

    return finalParams;
  }
}

export const BASIC_TOOLS: ToolInterface<any>[] = [
  AskFollowupQuestions,
  UpdateTodolist,
  CompletionResult,
  BrowserSearch
];

export const CUSTOMED_TOOLS: ToolInterface<any>[] = [AssignTasks];

export { AskFollowupQuestions, UpdateTodolist, CompletionResult, AssignTasks, BrowserSearch };
