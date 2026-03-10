import type { ToolInterface, ToolNames } from "@amigo-llm/types/src/tool";
/**
 * 创建工具, 用于类型推导
 * @param tool 工具信息
 * @returns
 */
export const createTool = <K extends ToolNames>(tool: ToolInterface<K>): ToolInterface<K> => {
  return tool;
};
