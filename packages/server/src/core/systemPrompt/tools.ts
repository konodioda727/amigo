import type { ToolInterface, ToolParamDefinition } from "@amigo-llm/types";

// 辅助函数：根据参数结构智能推断类型
function inferParameterType(param: ToolParamDefinition<string>): "string" | "array" | "object" {
  if (param.type) {
    return param.type; // 优先使用明确指定的类型
  }
  // 根据您的描述，如果类型未指定：
  if (param.params && param?.params.length > 0) {
    return "object"; // 有嵌套参数，则推断为对象（这是最合理的默认推断）
  }
  // 默认推断为字符串（作为最常见的原子类型）
  return "string";
}

// 辅助函数：将 TypeScript 类型映射到 Agent 提示词中的描述
function mapTypeToDescription(type: "string" | "array" | "object"): string {
  switch (type) {
    case "string":
      return "字符串 (string)";
    case "array":
      return "列表/数组 (array)";
    case "object":
      return "对象 (object)";
    default:
      return "任意类型";
  }
}

/**
 * 递归生成参数列表的详细描述字符串
 * @param params 参数数组
 * @param indent 当前缩进级别
 * @param isArrayElement 是否正在处理数组元素的结构（用于特殊格式化）
 * @returns 格式化后的参数字符串
 */
function generateParamsDescription(
  params: ToolParamDefinition<string>[],
  indent: string = "  ",
  isArrayElement: boolean = false,
): string {
  if (!params || params.length === 0) {
    return "";
  }

  // --- 数组元素特殊处理 ---
  if (isArrayElement && params.length === 1) {
    const element = params[0]!;
    const elementType = inferParameterType(element); // 推断元素类型

    let description = `${indent}元素类型: **${mapTypeToDescription(elementType)}**`;

    // 递归处理嵌套结构
    if (
      (elementType === "array" || elementType === "object") &&
      element.params &&
      element.params.length > 0
    ) {
      const innerIndent = indent + "  ";
      const innerType = elementType === "array" ? "列表项结构" : "对象属性结构";
      description += `\n${innerIndent}>> 内部结构（${innerType}）：`;
      description +=
        "\n" +
        generateParamsDescription(element.params, innerIndent + "  ", elementType === "array");
    }
    return description;
  }

  // --- 正常处理对象属性或顶层参数列表 ---
  return params
    .map((param) => {
      const paramType = inferParameterType(param); // 推断参数类型

      let description = `${indent}- **${param.name}** (${mapTypeToDescription(paramType)}${param.optional ? "，可选" : "，必填"})：${param.description}`;

      // 处理数组类型：其 params 描述的是“列表项结构”
      if (paramType === "array" && param.params && param.params.length > 0) {
        const innerIndent = indent + "  ";
        description += `\n${innerIndent}>> 列表项结构（所有元素都遵循此结构）：`;
        // 递归调用，并标记正在处理数组元素结构
        description += "\n" + generateParamsDescription(param.params, innerIndent + "  ", true);

        // 处理对象类型（包括推断出的对象）：其 params 描述的是“对象属性结构”
      } else if (paramType === "object" && param.params && param.params.length > 0) {
        const innerIndent = indent + "  ";
        description += `\n${innerIndent}>> 对象属性结构：`;
        // 递归调用
        description += "\n" + generateParamsDescription(param.params, innerIndent + "  ", false);
      }
      return description;
    })
    .join("\n");
}

/**
 * 根据注册的 ToolClass 生成包含详细参数说明的工具说明字符串
 * @param tools 工具列表
 * @param allToolNames 所有可用工具的名称列表（用于在 AssignTasks 等工具中注入）
 */
export function generateToolsPrompt(
  tools: Array<ToolInterface<any>>,
  allToolNames?: string[],
): string {
  return tools
    .map((tool) => {
      const toolParams = tool.params;
      let paramsSection = "";

      if (Array.isArray(toolParams) && toolParams.length > 0) {
        paramsSection = [`输入参数 (Params)：`, generateParamsDescription(toolParams, "  ")].join(
          "\n",
        );
      }

      // 特殊处理：为 assignTasks 工具动态注入可用工具列表
      let whenToUseText = tool.whenToUse;
      if (tool.name === "assignTasks" && allToolNames && allToolNames.length > 0) {
        whenToUseText = `${tool.whenToUse}\n\n**当前可用的工具名称列表：**\n${allToolNames.map((name) => `  - ${name}`).join("\n")}\n\n**请只使用上述列表中的工具名称。如果需要的工具不在列表中，请将 tools 留空。**`;
      }

      return [
        `【${tool.name}】`,
        `描述：${tool.description}`,
        `适用场景：${whenToUseText}`,
        paramsSection, // 插入参数说明部分
        Array.isArray(tool.useExamples) && tool.useExamples.length > 0
          ? `用例：\n${tool.useExamples.map((e) => `- ${e}`).join("\n")}`
          : "",
        "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}
