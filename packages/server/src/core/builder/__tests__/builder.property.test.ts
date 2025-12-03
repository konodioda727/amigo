/**
 * 构建器 API 的属性测试
 *
 * 测试以下正确性属性：
 * - 属性 9: 构建器链式调用
 * - 属性 10: 构建器生成服务器
 * - 属性 11: 注册表累积
 */

import { describe, expect, test } from "bun:test";
import type { ToolInterface, ToolNames } from "@amigo-llm/types";
import * as fc from "fast-check";
import { z } from "zod";
import AmigoServer from "../../server";
import { AmigoServerBuilder } from "../index";

// ============================================================================
// 测试生成器 (Arbitraries)
// ============================================================================

/**
 * 生成有效端口号 (1-65535)
 */
const validPortArb = fc.integer({ min: 1, max: 65535 });

/**
 * 生成有效存储路径
 */
const validStoragePathArb = fc.stringMatching(/^\.?[a-zA-Z0-9_\-./]{1,50}$/);

/**
 * 生成有效的工具名称（小写字母开头，包含字母/数字/下划线）
 */
const toolNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/);

/**
 * 生成有效的消息类型名称（驼峰命名风格）
 */
const messageTypeArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,19}$/);

/**
 * 创建用于测试的模拟工具定义
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
 * 创建用于测试的模拟消息定义
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

describe("构建器属性测试", () => {
  /**
   * **Feature: server-sdk, Property 9: Builder chaining**
   * **Validates: Requirements 4.1**
   *
   * 对于任意构建器方法调用序列（port, storagePath, registerTool, registerMessage），
   * 每个方法应当返回相同的构建器实例，以支持方法链式调用。
   */
  describe("属性 9: 构建器链式调用", () => {
    test("port() 方法应返回相同的构建器实例", () => {
      fc.assert(
        fc.property(validPortArb, (port) => {
          const builder = new AmigoServerBuilder();
          const result = builder.port(port);
          expect(result).toBe(builder);
        }),
        { numRuns: 100 },
      );
    });

    test("storagePath() 方法应返回相同的构建器实例", () => {
      fc.assert(
        fc.property(validStoragePathArb, (path) => {
          const builder = new AmigoServerBuilder();
          const result = builder.storagePath(path);
          expect(result).toBe(builder);
        }),
        { numRuns: 100 },
      );
    });

    test("registerTool() 方法应返回相同的构建器实例", () => {
      fc.assert(
        fc.property(
          toolNameArb.filter((name) => name.length > 0),
          (toolName) => {
            const builder = new AmigoServerBuilder();
            const tool = createMockTool(toolName);
            const result = builder.registerTool(tool);
            expect(result).toBe(builder);
          },
        ),
        { numRuns: 100 },
      );
    });

    test("registerMessage() 方法应返回相同的构建器实例", () => {
      fc.assert(
        fc.property(
          messageTypeArb.filter((type) => type.length > 0),
          (messageType) => {
            const builder = new AmigoServerBuilder();
            const message = createMockMessage(messageType);
            const result = builder.registerMessage(message);
            expect(result).toBe(builder);
          },
        ),
        { numRuns: 100 },
      );
    });

    test("链式调用多个方法应始终返回相同的构建器实例", () => {
      fc.assert(
        fc.property(
          validPortArb,
          validStoragePathArb,
          toolNameArb.filter((name) => name.length > 0),
          messageTypeArb.filter((type) => type.length > 0),
          (port, storagePath, toolName, messageType) => {
            const builder = new AmigoServerBuilder();
            const tool = createMockTool(toolName);
            const message = createMockMessage(messageType);

            // 链式调用所有方法
            const result = builder
              .port(port)
              .storagePath(storagePath)
              .registerTool(tool)
              .registerMessage(message);

            expect(result).toBe(builder);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: server-sdk, Property 10: Builder produces server**
   * **Validates: Requirements 4.2**
   *
   * 对于任意有效的构建器配置，调用 build() 应当返回一个 AmigoServer 实例，
   * 并包含累积的配置。
   */
  describe("属性 10: 构建器生成服务器", () => {
    test("build() 应返回 AmigoServer 实例", () => {
      fc.assert(
        fc.property(validPortArb, validStoragePathArb, (port, storagePath) => {
          const builder = new AmigoServerBuilder().port(port).storagePath(storagePath);

          const server = builder.build();

          expect(server).toBeInstanceOf(AmigoServer);
        }),
        { numRuns: 100 },
      );
    });

    test("build() 应返回包含注册表的服务器实例", () => {
      fc.assert(
        fc.property(
          validPortArb,
          toolNameArb.filter((name) => name.length > 0),
          messageTypeArb.filter((type) => type.length > 0),
          (port, toolName, messageType) => {
            const tool = createMockTool(toolName);
            const message = createMockMessage(messageType);

            const server = new AmigoServerBuilder()
              .port(port)
              .registerTool(tool)
              .registerMessage(message)
              .build();

            expect(server).toBeInstanceOf(AmigoServer);
            expect(server.toolRegistry).toBeDefined();
            expect(server.messageRegistry).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    test("使用默认配置的 build() 也应返回有效的服务器实例", () => {
      const builder = new AmigoServerBuilder();
      const server = builder.build();

      expect(server).toBeInstanceOf(AmigoServer);
    });
  });

  /**
   * **Feature: server-sdk, Property 11: Registry accumulation**
   * **Validates: Requirements 4.3, 4.4**
   *
   * 对于通过构建器注册的 N 个工具和 M 个消息，
   * 最终服务器应当在其注册表中包含恰好 N 个工具和 M 个消息。
   */
  describe("属性 11: 注册表累积", () => {
    test("注册 N 个工具后，注册表应包含恰好 N 个工具", () => {
      fc.assert(
        fc.property(
          fc
            .array(
              toolNameArb.filter((name) => name.length > 0),
              { minLength: 1, maxLength: 20 },
            )
            .map((names) => [...new Set(names)]) // 确保名称唯一
            .filter((names) => names.length > 0),
          (toolNames) => {
            const builder = new AmigoServerBuilder();
            const tools = toolNames.map(createMockTool);

            for (const tool of tools) {
              builder.registerTool(tool);
            }

            const server = builder.build();

            expect(server.toolRegistry?.size).toBe(tools.length);

            // 验证每个工具都在注册表中
            for (const tool of tools) {
              expect(server.toolRegistry?.has(tool.name)).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    test("注册 M 个消息后，注册表应包含恰好 M 个消息", () => {
      fc.assert(
        fc.property(
          fc
            .array(
              messageTypeArb.filter((type) => type.length > 0),
              { minLength: 1, maxLength: 20 },
            )
            .map((types) => [...new Set(types)]) // 确保类型唯一
            .filter((types) => types.length > 0),
          (messageTypes) => {
            const builder = new AmigoServerBuilder();
            const messages = messageTypes.map(createMockMessage);

            for (const message of messages) {
              builder.registerMessage(message);
            }

            const server = builder.build();

            expect(server.messageRegistry?.size).toBe(messages.length);

            // 验证每个消息都在注册表中
            for (const message of messages) {
              expect(server.messageRegistry?.has(message.type)).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    test("注册 N 个工具和 M 个消息后，注册表应分别包含恰好 N 和 M 个项目", () => {
      fc.assert(
        fc.property(
          fc
            .array(
              toolNameArb.filter((name) => name.length > 0),
              { minLength: 1, maxLength: 10 },
            )
            .map((names) => [...new Set(names)])
            .filter((names) => names.length > 0),
          fc
            .array(
              messageTypeArb.filter((type) => type.length > 0),
              { minLength: 1, maxLength: 10 },
            )
            .map((types) => [...new Set(types)])
            .filter((types) => types.length > 0),
          (toolNames, messageTypes) => {
            const builder = new AmigoServerBuilder();
            const tools = toolNames.map(createMockTool);
            const messages = messageTypes.map(createMockMessage);

            // 注册所有工具和消息
            for (const tool of tools) {
              builder.registerTool(tool);
            }
            for (const message of messages) {
              builder.registerMessage(message);
            }

            const server = builder.build();

            // 验证工具数量
            expect(server.toolRegistry?.size).toBe(tools.length);
            // 验证消息数量
            expect(server.messageRegistry?.size).toBe(messages.length);

            // 验证所有工具都存在
            for (const tool of tools) {
              expect(server.toolRegistry?.has(tool.name)).toBe(true);
            }
            // 验证所有消息都存在
            for (const message of messages) {
              expect(server.messageRegistry?.has(message.type)).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    test("构建器的注册表与服务器的注册表应包含相同的项目", () => {
      fc.assert(
        fc.property(
          fc
            .array(
              toolNameArb.filter((name) => name.length > 0),
              { minLength: 1, maxLength: 5 },
            )
            .map((names) => [...new Set(names)])
            .filter((names) => names.length > 0),
          fc
            .array(
              messageTypeArb.filter((type) => type.length > 0),
              { minLength: 1, maxLength: 5 },
            )
            .map((types) => [...new Set(types)])
            .filter((types) => types.length > 0),
          (toolNames, messageTypes) => {
            const builder = new AmigoServerBuilder();
            const tools = toolNames.map(createMockTool);
            const messages = messageTypes.map(createMockMessage);

            for (const tool of tools) {
              builder.registerTool(tool);
            }
            for (const message of messages) {
              builder.registerMessage(message);
            }

            // 构建前检查构建器的注册表
            expect(builder.toolRegistry.size).toBe(tools.length);
            expect(builder.messageRegistry.size).toBe(messages.length);

            const server = builder.build();

            // 构建后服务器的注册表应与构建器的注册表一致
            expect(server.toolRegistry?.size).toBe(builder.toolRegistry.size);
            expect(server.messageRegistry?.size).toBe(builder.messageRegistry.size);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
