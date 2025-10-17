import type { ToolInterface, ToolResult } from "@amigo/types/src/tool";
import { XMLParser } from "fast-xml-parser";
import { systemReservedTags } from "@amigo/types";
import { ensureArray } from "@/utils/array";

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
   * 解析 XML 并自动调用所有工具
   */
  public async parseAndExecute({
    xmlParams,
    getCurrentTask,
  }: {
    xmlParams: string;
    getCurrentTask: () => string;
  }): Promise<{ message: string; params: Record<string, any>; toolResult: ToolResult<any> }> {
    const params = this.parseParams(xmlParams);
    if (!params || Object.keys(params).length !== 1) {
      throw new Error("每次能且只能调用一个工具");
    }
    const name = Object.keys(params)[0]!;
    const param = params[name];
    const tool = this._availableTools[name];
    if (!tool) {
      if (systemReservedTags.includes(name as any)) {
        return {
          message: "",
          toolResult: "",
          params: param,
        };
      }
      console.warn(`[ToolService] 未找到名为 '${name}' 的工具。`);
      return {
        message: "",
        toolResult: '',
        params: {},
      };
    }
    
    const hasParams = tool.params.length !== 0;
    let finalParams: string | Record<string, any> = {};
    try {
      finalParams = hasParams
        ? this.mapAndValidateParams(param, tool.params)
        : JSON.stringify(param);
    } catch (error) {
      return {
        message: `工具参数解析失败: ${(error as Error).message}`,
        params: {},
        toolResult: '',
      };
    }
    const { toolResult, message } = await tool.invoke({
      params: finalParams as any,
      getCurrentTask,
      getToolFromName: (name: string) => this._availableTools[name],
    });
    return { message, toolResult, params: finalParams as any };
  }

  public parseParams(buffer: string) {
    const completedXml = this.completePartialXml(buffer);
    const parser = new XMLParser({
      ignoreAttributes: true,
    });
    const jsonOutput = parser.parse(completedXml);
    return jsonOutput;
  }

  /**
   * 补全不完整的 XML 字符串。
   * @param xmlString 不完整的 XML 字符串，例如 "<ask_question><a>123"
   * @returns 补全后的 XML 字符串，例如 "<ask_question><a>123</a></ask_question>"
   */
  private completePartialXml(xmlString: string): string {
    let processedString = xmlString;

    // 步骤 1: 检测并移除末尾可能存在的任何部分标签
    const lastOpenBracketIndex = processedString.lastIndexOf("<");
    const lastCloseBracketIndex = processedString.lastIndexOf(">");
    // 如果最后一个 '<' 在最后一个 '>' 之后，说明有一个未闭合的标签
    // 例如: "...<think>some thoughts</thi"
    if (lastOpenBracketIndex > -1 && lastOpenBracketIndex > lastCloseBracketIndex) {
      processedString = processedString.substring(0, lastOpenBracketIndex);
    }

    const allTags = [...systemReservedTags, ...this.toolNames];
    if (allTags.length === 0) {
      return processedString; // 如果没有定义任何标签，直接返回处理过的字符串
    }

    const tagPattern = allTags.join("|");
    const tagRegex = new RegExp(`<(${tagPattern})\\b[^>]*>|<\\/(${tagPattern})>`, "g");

    const openTags: string[] = [];
    let match: RegExpExecArray | null;

    // 遍历所有完整的标签，维护一个开放标签的栈
    while ((match = tagRegex.exec(processedString)) !== null) {
      if (match[1]) {
        openTags.push(match[1]);
      } else if (match[2]) {
        // 如果栈顶是对应的开始标签，则出栈
        if (openTags.length > 0 && openTags[openTags.length - 1] === match[2]) {
          openTags.pop();
        }
      }
    }

    let completedString = processedString;
    while (openTags.length > 0) {
      const tagToClose = openTags.pop()!;
      completedString += `</${tagToClose}>`;
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
  private mapAndValidateParams(rawData: any, paramDefinitions: any[]): Record<string, any> {
    if (!rawData || typeof rawData !== "object") {
      console.warn("[parseTool] data is not object");
      return {};
    }

    const finalParams: Record<string, any> = {};

    // 遍历所有期望的参数定义
    for (const paramDef of paramDefinitions) {
      const rawValue = rawData[paramDef.name];

      // 检查非可选参数的缺失 (可选：可以加入更严格的 Zod 检查)
      if (!paramDef.optional && (rawValue === undefined || rawValue === null)) {
        throw new Error(`[parseTool] Tool param '${paramDef.name}' is missing but is required.`);
      }

      // 如果字段缺失且是可选的，跳过
      if (rawValue === undefined) {
        continue;
      }

      // --- 1. 数组类型 (type: "array") ---
      if (paramDef.type === "array" && !Array.isArray(rawValue)) {
        // 如果为数组类型，则 params 定义中必须有且仅有一个子定义
        if (paramDef.params.length !== 1) {
          console.warn(
            `[parseTool] Array type param '${paramDef.name}' should have exactly one child definition.`,
          );
          continue;
        }
        if (Object.keys(rawValue).length !== 1) {
          console.warn(
            `[parseTool] Array type param '${paramDef.name}' should have exactly one child element instance named ${paramDef.params[0]?.name}.`,
          );
          finalParams[paramDef.name] = [];
          continue;
        }
        const childTag = paramDef.params[0];
        const childTagName = childTag?.name;
        const rawArray = ensureArray(rawValue[childTagName]);

        // 如果数组元素有更深层次的定义, 递归处理数组中的每个元素
        if (childTag.params) {
          finalParams[paramDef.name] = rawArray.map((item: any) =>
            this.mapAndValidateParams(item, childTag.params!),
          );
        } else {
          finalParams[paramDef.name] = rawArray;
        }
      }

      // --- 2. 对象类型 (type: "object" 或具有子标签的复杂结构) ---
      else if (paramDef.params) {
        // 递归处理子对象
        finalParams[paramDef.name] = this.mapAndValidateParams(rawValue, paramDef.params);
      }

      // --- 3. 基本类型 (string, number, boolean) ---
      else {
        // 直接赋值，只保留 params 定义的字段 (实现了过滤)
        finalParams[paramDef.name] = rawValue;
      }
    }

    return finalParams;
  }
}

export { AskFollowupQuestions } from "./askFollowupQuestions";
export { UpdateTodolist } from "./todolist";
export { CompletionResult } from "./completionResult";
export { AssignTasks } from "./assignTasks";
