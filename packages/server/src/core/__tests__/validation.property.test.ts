/**
 * 工具参数验证和消息验证的属性测试
 *
 * 测试以下正确性属性：
 * - 属性 3: 工具参数验证
 * - 属性 6: 消息验证
 *
 * **Feature: server-sdk, Property 3: Tool parameter validation**
 * **Feature: server-sdk, Property 6: Message validation**
 * **Validates: Requirements 2.2, 2.3, 3.2, 3.3**
 */

import { describe, expect, test } from "bun:test";
import type { ToolInterface, ToolNames, ToolParam } from "@amigo-llm/types";
import { defineMessage } from "@amigo-llm/types/src/message";
import * as fc from "fast-check";
import { z } from "zod";
import { ToolService } from "../tools";

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建一个简单的测试工具
 */
function createTestTool(
  name: string,
  requiredParams: string[],
  optionalParams: string[] = [],
): ToolInterface<ToolNames> {
  const params: ToolParam<string>[] = [
    ...requiredParams.map((p) => ({
      name: p,
      optional: false,
      description: `必需参数: ${p}`,
    })),
    ...optionalParams.map((p) => ({
      name: p,
      optional: true,
      description: `可选参数: ${p}`,
    })),
  ];

  return {
    name: name as ToolNames,
    description: `测试工具: ${name}`,
    whenToUse: "用于测试目的",
    params,
    useExamples: [`<${name}>${requiredParams.map((p) => `<${p}>value</${p}>`).join("")}</${name}>`],
    invoke: async ({ params: invokeParams }: { params: Record<string, unknown> }) => ({
      message: "成功",
      toolResult: { received: invokeParams },
    }),
  } as unknown as ToolInterface<ToolNames>;
}

/**
 * 生成工具调用的 XML 字符串
 */
function generateToolXml(toolName: string, params: Record<string, string>): string {
  const paramsXml = Object.entries(params)
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join("");
  return `<${toolName}>${paramsXml}</${toolName}>`;
}

// ============================================================================
// 测试生成器 (Arbitraries)
// ============================================================================

const messageTypeArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,15}$/);
const safeStringArb = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/);

// ============================================================================
// 属性测试
// ============================================================================

describe("验证属性测试", () => {
  /**
   * **Feature: server-sdk, Property 3: Tool parameter validation**
   * **Validates: Requirements 2.2, 2.3**
   */
  describe("属性 3: 工具参数验证", () => {
    // 使用固定的工具名和参数名来避免 XML 解析器的动态标签收集问题
    const TOOL_NAME = "test_validation_tool";
    const PARAM_A = "param_a";
    const PARAM_B = "param_b";
    const OPTIONAL_PARAM = "optional_param";

    describe("有效参数应被接受", () => {
      test("提供所有必需参数时，工具应成功执行", async () => {
        await fc.assert(
          fc.asyncProperty(safeStringArb, async (value) => {
            const tool = createTestTool(TOOL_NAME, [PARAM_A]);
            const toolService = new ToolService([tool], []);
            const xml = generateToolXml(TOOL_NAME, { [PARAM_A]: value });

            const result = await toolService.parseAndExecute({
              xmlParams: xml,
              getCurrentTask: () => "test-task",
            });

            expect(result.error).toBeUndefined();
            expect(result.message).toBe("成功");
          }),
          { numRuns: 100 },
        );
      });

      test("提供多个必需参数时，工具应成功执行", async () => {
        await fc.assert(
          fc.asyncProperty(safeStringArb, safeStringArb, async (valueA, valueB) => {
            const tool = createTestTool(TOOL_NAME, [PARAM_A, PARAM_B]);
            const toolService = new ToolService([tool], []);
            const xml = generateToolXml(TOOL_NAME, {
              [PARAM_A]: valueA,
              [PARAM_B]: valueB,
            });

            const result = await toolService.parseAndExecute({
              xmlParams: xml,
              getCurrentTask: () => "test-task",
            });

            expect(result.error).toBeUndefined();
            expect(result.message).toBe("成功");
          }),
          { numRuns: 100 },
        );
      });

      test("提供必需参数和可选参数时，工具应成功执行", async () => {
        await fc.assert(
          fc.asyncProperty(safeStringArb, safeStringArb, async (reqValue, optValue) => {
            const tool = createTestTool(TOOL_NAME, [PARAM_A], [OPTIONAL_PARAM]);
            const toolService = new ToolService([tool], []);
            const xml = generateToolXml(TOOL_NAME, {
              [PARAM_A]: reqValue,
              [OPTIONAL_PARAM]: optValue,
            });

            const result = await toolService.parseAndExecute({
              xmlParams: xml,
              getCurrentTask: () => "test-task",
            });

            expect(result.error).toBeUndefined();
            expect(result.message).toBe("成功");
          }),
          { numRuns: 100 },
        );
      });

      test("只提供必需参数（省略可选参数）时，工具应成功执行", async () => {
        await fc.assert(
          fc.asyncProperty(safeStringArb, async (value) => {
            const tool = createTestTool(TOOL_NAME, [PARAM_A], [OPTIONAL_PARAM]);
            const toolService = new ToolService([tool], []);
            const xml = generateToolXml(TOOL_NAME, { [PARAM_A]: value });

            const result = await toolService.parseAndExecute({
              xmlParams: xml,
              getCurrentTask: () => "test-task",
            });

            expect(result.error).toBeUndefined();
            expect(result.message).toBe("成功");
          }),
          { numRuns: 100 },
        );
      });
    });

    describe("无效参数应被拒绝", () => {
      test("缺少必需参数时，应返回错误", async () => {
        await fc.assert(
          fc.asyncProperty(safeStringArb, async (value) => {
            const tool = createTestTool(TOOL_NAME, [PARAM_A, PARAM_B]);
            const toolService = new ToolService([tool], []);
            const xml = generateToolXml(TOOL_NAME, { [PARAM_A]: value });

            const result = await toolService.parseAndExecute({
              xmlParams: xml,
              getCurrentTask: () => "test-task",
            });

            expect(result.error).toBeDefined();
            expect(result.error).toContain("缺少必需参数");
          }),
          { numRuns: 100 },
        );
      });

      test("调用不存在的工具时，应返回错误", async () => {
        await fc.assert(
          fc.asyncProperty(safeStringArb, async (value) => {
            const tool = createTestTool(TOOL_NAME, [PARAM_A]);
            const toolService = new ToolService([tool], []);
            const xml = generateToolXml("nonexistent_tool", { [PARAM_A]: value });

            const result = await toolService.parseAndExecute({
              xmlParams: xml,
              getCurrentTask: () => "test-task",
            });

            expect(result.error).toBeDefined();
            expect(result.error).toContain("不存在");
          }),
          { numRuns: 100 },
        );
      });
    });

    describe("参数值验证", () => {
      test("包含数字的参数值应被接受", async () => {
        await fc.assert(
          fc.asyncProperty(fc.integer({ min: 0, max: 10000 }).map(String), async (numericValue) => {
            const tool = createTestTool(TOOL_NAME, [PARAM_A]);
            const toolService = new ToolService([tool], []);
            const xml = generateToolXml(TOOL_NAME, { [PARAM_A]: numericValue });

            const result = await toolService.parseAndExecute({
              xmlParams: xml,
              getCurrentTask: () => "test-task",
            });

            expect(result.error).toBeUndefined();
            expect(result.message).toBe("成功");
          }),
          { numRuns: 100 },
        );
      });
    });
  });

  /**
   * **Feature: server-sdk, Property 6: Message validation**
   * **Validates: Requirements 3.2, 3.3**
   */
  describe("属性 6: 消息验证", () => {
    describe("有效消息数据应被接受", () => {
      test("符合 Schema 的消息数据应通过验证", () => {
        fc.assert(
          fc.property(messageTypeArb, safeStringArb, (messageType, content) => {
            const message = defineMessage({
              type: messageType,
              dataSchema: z.object({ content: z.string() }),
            });

            const validData = { type: messageType, data: { content } };
            const result = message.schema.safeParse(validData);
            expect(result.success).toBe(true);
          }),
          { numRuns: 100 },
        );
      });

      test("带有多个字段的消息数据应通过验证", () => {
        fc.assert(
          fc.property(
            messageTypeArb,
            safeStringArb,
            fc.integer({ min: 0, max: 1000 }),
            fc.boolean(),
            (messageType, title, count, enabled) => {
              const message = defineMessage({
                type: messageType,
                dataSchema: z.object({
                  title: z.string(),
                  count: z.number(),
                  enabled: z.boolean(),
                }),
              });

              const validData = { type: messageType, data: { title, count, enabled } };
              const result = message.schema.safeParse(validData);
              expect(result.success).toBe(true);
            },
          ),
          { numRuns: 100 },
        );
      });

      test("带有可选字段的消息数据应通过验证", () => {
        fc.assert(
          fc.property(
            messageTypeArb,
            safeStringArb,
            fc.option(safeStringArb, { nil: undefined }),
            (messageType, required, optional) => {
              const message = defineMessage({
                type: messageType,
                dataSchema: z.object({
                  required: z.string(),
                  optional: z.string().optional(),
                }),
              });

              const validData = {
                type: messageType,
                data: optional !== undefined ? { required, optional } : { required },
              };
              const result = message.schema.safeParse(validData);
              expect(result.success).toBe(true);
            },
          ),
          { numRuns: 100 },
        );
      });
    });

    describe("无效消息数据应被拒绝", () => {
      test("类型不匹配的消息应被拒绝", () => {
        fc.assert(
          fc.property(
            messageTypeArb,
            messageTypeArb,
            safeStringArb,
            (messageType, wrongType, content) => {
              if (messageType === wrongType) return;

              const message = defineMessage({
                type: messageType,
                dataSchema: z.object({ content: z.string() }),
              });

              const invalidData = { type: wrongType, data: { content } };
              const result = message.schema.safeParse(invalidData);
              expect(result.success).toBe(false);
            },
          ),
          { numRuns: 100 },
        );
      });

      test("缺少必需字段的消息应被拒绝", () => {
        fc.assert(
          fc.property(messageTypeArb, (messageType) => {
            const message = defineMessage({
              type: messageType,
              dataSchema: z.object({
                required: z.string(),
                alsoRequired: z.number(),
              }),
            });

            const invalidData = { type: messageType, data: { required: "value" } };
            const result = message.schema.safeParse(invalidData);
            expect(result.success).toBe(false);
          }),
          { numRuns: 100 },
        );
      });

      test("字段类型错误的消息应被拒绝", () => {
        fc.assert(
          fc.property(messageTypeArb, fc.integer(), (messageType, wrongValue) => {
            const message = defineMessage({
              type: messageType,
              dataSchema: z.object({ content: z.string() }),
            });

            const invalidData = { type: messageType, data: { content: wrongValue } };
            const result = message.schema.safeParse(invalidData);
            expect(result.success).toBe(false);
          }),
          { numRuns: 100 },
        );
      });

      test("缺少 data 字段的消息应被拒绝", () => {
        fc.assert(
          fc.property(messageTypeArb, (messageType) => {
            const message = defineMessage({
              type: messageType,
              dataSchema: z.object({ content: z.string() }),
            });

            const invalidData = { type: messageType };
            const result = message.schema.safeParse(invalidData);
            expect(result.success).toBe(false);
          }),
          { numRuns: 100 },
        );
      });

      test("额外字段应被 strict schema 拒绝", () => {
        fc.assert(
          fc.property(
            messageTypeArb,
            safeStringArb,
            safeStringArb,
            (messageType, content, extraValue) => {
              const message = defineMessage({
                type: messageType,
                dataSchema: z.object({ content: z.string() }).strict(),
              });

              const invalidData = { type: messageType, data: { content, extraField: extraValue } };
              const result = message.schema.safeParse(invalidData);
              expect(result.success).toBe(false);
            },
          ),
          { numRuns: 100 },
        );
      });
    });

    describe("复杂消息验证", () => {
      test("嵌套对象的消息应正确验证", () => {
        fc.assert(
          fc.property(
            messageTypeArb,
            safeStringArb,
            safeStringArb,
            fc.integer({ min: 0, max: 100 }),
            (messageType, name, city, age) => {
              const message = defineMessage({
                type: messageType,
                dataSchema: z.object({
                  user: z.object({ name: z.string(), age: z.number() }),
                  address: z.object({ city: z.string() }),
                }),
              });

              const validData = {
                type: messageType,
                data: { user: { name, age }, address: { city } },
              };
              const result = message.schema.safeParse(validData);
              expect(result.success).toBe(true);
            },
          ),
          { numRuns: 100 },
        );
      });

      test("数组字段的消息应正确验证", () => {
        fc.assert(
          fc.property(
            messageTypeArb,
            fc.array(safeStringArb, { minLength: 0, maxLength: 5 }),
            (messageType, items) => {
              const message = defineMessage({
                type: messageType,
                dataSchema: z.object({ items: z.array(z.string()) }),
              });

              const validData = { type: messageType, data: { items } };
              const result = message.schema.safeParse(validData);
              expect(result.success).toBe(true);
            },
          ),
          { numRuns: 100 },
        );
      });

      test("枚举字段的消息应正确验证", () => {
        fc.assert(
          fc.property(
            messageTypeArb,
            fc.constantFrom("low", "medium", "high"),
            (messageType, priority) => {
              const message = defineMessage({
                type: messageType,
                dataSchema: z.object({ priority: z.enum(["low", "medium", "high"]) }),
              });

              const validData = { type: messageType, data: { priority } };
              const result = message.schema.safeParse(validData);
              expect(result.success).toBe(true);
            },
          ),
          { numRuns: 100 },
        );
      });

      test("无效枚举值应被拒绝", () => {
        fc.assert(
          fc.property(
            messageTypeArb,
            safeStringArb.filter((s) => !["low", "medium", "high"].includes(s)),
            (messageType, invalidPriority) => {
              const message = defineMessage({
                type: messageType,
                dataSchema: z.object({ priority: z.enum(["low", "medium", "high"]) }),
              });

              const invalidData = { type: messageType, data: { priority: invalidPriority } };
              const result = message.schema.safeParse(invalidData);
              expect(result.success).toBe(false);
            },
          ),
          { numRuns: 100 },
        );
      });
    });
  });
});
