/**
 * SDK 辅助函数
 *
 * 提供类型安全的工具和消息定义辅助函数
 */

import type { ToolInterface, ToolNames } from "@amigo-llm/types";
import { defineMessage as defineMessageFromTypes } from "@amigo-llm/types";

/**
 * 定义工具的辅助函数
 *
 * 提供类型安全的工具定义，确保参数和返回值类型正确
 *
 * @example
 * ```typescript
 * const myTool = defineTool({
 *   name: "my_tool",
 *   description: "My custom tool",
 *   whenToUse: "When you need to do something",
 *   params: [{ name: "input", optional: false, description: "Input text" }],
 *   useExamples: ["<my_tool><input>test</input></my_tool>"],
 *   invoke: async ({ params }) => ({
 *     message: "Done",
 *     toolResult: params.input,
 *   }),
 * });
 * ```
 */
export function defineTool<K extends ToolNames>(definition: ToolInterface<K>): ToolInterface<K> {
  return definition;
}

/**
 * 定义消息的辅助函数（从 types 包重新导出）
 *
 * @example
 * ```typescript
 * const myMessage = defineMessage({
 *   type: "myNotification",
 *   dataSchema: z.object({ text: z.string() }),
 * });
 * ```
 */
export const defineMessage = defineMessageFromTypes;
