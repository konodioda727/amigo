/**
 * 工具注册表和消息注册表的属性测试
 *
 * 测试以下正确性属性：
 * - 属性 5: 重复工具拒绝
 * - 属性 8: 重复消息拒绝
 * - 属性 13: 注册表检索正确性
 */

import { describe, expect, test } from "bun:test";
import type { ToolInterface, ToolNames } from "@amigo-llm/types";
import * as fc from "fast-check";
import { z } from "zod";
import { MessageRegistry, RegistrationError, ToolRegistry } from "../index";

// ============================================================================
// 测试生成器 (Arbitraries)
// ============================================================================

/**
 * 生成有效的工具名称（小写字母开头，包含字母/数字/下划线）
 */
const toolNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/);

/**
 * 生成有效的消息类型名称（驼峰命名风格）
 */
const messageTypeArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,19}$/);

/**
 * 创建用于测试注册表操作的模拟工具定义
 * 注意：使用类型断言，因为我们测试的是注册表行为，而非工具执行
 */
const createMockTool = (name: string): ToolInterface<ToolNames> =>
  ({
    name: name as ToolNames,
    description: `测试工具: ${name}`,
    whenToUse: "用于测试目的",
    params: [{ name: "input", optional: false, description: "测试输入" }],
    useExamples: [`<${name}><input>test</input></${name}>`],
    invoke: async () => ({ message: "成功", toolResult: {} }),
  }) as unknown as ToolInterface<ToolNames>;

/**
 * 创建用于测试注册表操作的模拟消息定义
 */
const createMockMessage = (type: string) => ({
  type,
  schema: z.object({
    type: z.literal(type),
    data: z.object({ content: z.string() }),
  }),
});

// ============================================================================
// 属性测试
// ============================================================================

describe("注册表属性测试", () => {
  /**
   * **Feature: server-sdk, Property 5: Duplicate tool rejection**
   * **Validates: Requirements 2.5**
   *
   * 对于任意两个同名工具，当注册第二个工具时，
   * SDK 应当抛出错误指示名称冲突。
   */
  describe("属性 5: 重复工具拒绝", () => {
    const toolNames = fc.sample(
      toolNameArb.filter((name) => name.length > 0),
      5,
    );

    for (const toolName of toolNames) {
      test(`注册重复工具 '${toolName}' 应抛出 RegistrationError`, () => {
        const registry = new ToolRegistry();
        const tool1 = createMockTool(toolName);
        const tool2 = createMockTool(toolName);

        // 第一次注册应成功
        expect(() => registry.register(tool1)).not.toThrow();

        // 第二次注册同名工具应抛出 RegistrationError
        expect(() => registry.register(tool2)).toThrow(RegistrationError);
        expect(() => registry.register(tool2)).toThrow(`工具 "${toolName}" 已被注册`);

        // 注册表应仍只包含一个工具
        expect(registry.size).toBe(1);
      });
    }
  });

  /**
   * **Feature: server-sdk, Property 8: Duplicate message rejection**
   * **Validates: Requirements 3.4**
   *
   * 对于任意两个同类型的消息定义，当注册第二个消息时，
   * SDK 应当抛出错误指示类型冲突。
   */
  describe("属性 8: 重复消息拒绝", () => {
    const messageTypes = fc.sample(
      messageTypeArb.filter((type) => type.length > 0),
      5,
    );

    for (const messageType of messageTypes) {
      test(`注册重复消息类型 '${messageType}' 应抛出 RegistrationError`, () => {
        const registry = new MessageRegistry();
        const msg1 = createMockMessage(messageType);
        const msg2 = createMockMessage(messageType);

        // 第一次注册应成功
        expect(() => registry.register(msg1)).not.toThrow();

        // 第二次注册同类型消息应抛出 RegistrationError
        expect(() => registry.register(msg2)).toThrow(RegistrationError);
        expect(() => registry.register(msg2)).toThrow(`消息类型 "${messageType}" 已被注册`);

        // 注册表应仍只包含一个消息
        expect(registry.size).toBe(1);
      });
    }
  });

  /**
   * **Feature: server-sdk, Property 13: Registry retrieval correctness**
   * **Validates: Requirements 6.4**
   *
   * 对于任意注册在注册表中的工具或消息，通过名称/类型检索
   * 应当返回与注册时完全相同的定义。
   */
  describe("属性 13: 注册表检索正确性", () => {
    describe("工具注册表检索", () => {
      const toolNameArrays = fc.sample(
        fc
          .array(
            toolNameArb.filter((name) => name.length > 0),
            { minLength: 1, maxLength: 20 },
          )
          .map((names) => [...new Set(names)]) // 确保名称唯一
          .filter((names) => names.length > 0),
        5,
      );

      for (const toolNames of toolNameArrays) {
        test(`检索 ${toolNames.length} 个已注册工具应返回完全相同的定义`, () => {
          const registry = new ToolRegistry();
          const tools = toolNames.map(createMockTool);

          // 注册所有工具
          for (const tool of tools) {
            registry.register(tool);
          }

          // 验证每个工具都能被检索且完全匹配
          for (const tool of tools) {
            const retrieved = registry.get(tool.name);
            expect(retrieved).toBeDefined();
            expect(retrieved).toBe(tool); // 相同引用
            expect(retrieved?.name).toBe(tool.name);
            expect(retrieved?.description).toBe(tool.description);
          }

          // 验证 getAll 返回所有已注册工具
          const allTools = registry.getAll();
          expect(allTools.length).toBe(tools.length);
          for (const tool of tools) {
            expect(allTools).toContain(tool);
          }

          // 验证 has() 正确工作
          for (const tool of tools) {
            expect(registry.has(tool.name)).toBe(true);
          }
          expect(registry.has("nonexistent_tool")).toBe(false);

          // 验证 size 正确
          expect(registry.size).toBe(tools.length);
        });
      }
    });

    describe("消息注册表检索", () => {
      const messageTypeArrays = fc.sample(
        fc
          .array(
            messageTypeArb.filter((type) => type.length > 0),
            { minLength: 1, maxLength: 20 },
          )
          .map((types) => [...new Set(types)]) // 确保类型唯一
          .filter((types) => types.length > 0),
        5,
      );

      for (const messageTypes of messageTypeArrays) {
        test(`检索 ${messageTypes.length} 个已注册消息应返回完全相同的定义`, () => {
          const registry = new MessageRegistry();
          const messages = messageTypes.map(createMockMessage);

          // 注册所有消息
          for (const msg of messages) {
            registry.register(msg);
          }

          // 验证每个消息都能被检索且完全匹配
          for (const msg of messages) {
            const retrieved = registry.get(msg.type);
            expect(retrieved).toBeDefined();
            expect(retrieved).toBe(msg); // 相同引用
            expect(retrieved?.type).toBe(msg.type);
            expect(retrieved?.schema).toBe(msg.schema);
          }

          // 验证 getAll 返回所有已注册消息
          const allMessages = registry.getAll();
          expect(allMessages.length).toBe(messages.length);
          for (const msg of messages) {
            expect(allMessages).toContain(msg);
          }

          // 验证 getAllSchemas 返回所有 schema
          const allSchemas = registry.getAllSchemas();
          expect(allSchemas.length).toBe(messages.length);
          for (const msg of messages) {
            expect(allSchemas).toContain(msg.schema);
          }

          // 验证 has() 正确工作
          for (const msg of messages) {
            expect(registry.has(msg.type)).toBe(true);
          }
          expect(registry.has("nonexistentType")).toBe(false);

          // 验证 size 正确
          expect(registry.size).toBe(messages.length);
        });
      }
    });
  });
});
