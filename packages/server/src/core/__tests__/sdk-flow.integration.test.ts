/**
 * SDK 完整流程集成测试
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { v4 as uuidV4 } from "uuid";
import { ToolRegistry, MessageRegistry } from "../registry";
import { ToolService, BASIC_TOOLS } from "../tools";
import { FilePersistedMemory } from "../memory";
import { setGlobalState, getGlobalState } from "@/globalState";

// biome-ignore lint/suspicious/noExplicitAny: 测试用 mock 工具
const createTestTool = (name: string, handler?: (ctx: any) => Promise<any>): any => ({
  name,
  description: `测试工具: ${name}`,
  whenToUse: `当需要测试 ${name} 功能时使用`,
  params: [
    { name: "input", optional: false, description: "输入参数", type: "string" },
    { name: "options", optional: true, description: "可选配置", type: "string" },
  ],
  useExamples: [`<${name}><input>测试输入</input></${name}>`],
  // biome-ignore lint/suspicious/noExplicitAny: 测试用
  invoke: handler || (async ({ params }: any) => ({
    message: `工具 ${name} 执行成功，输入: ${params.input}`,
    toolResult: { success: true, input: params.input },
  })),
});

// biome-ignore lint/suspicious/noExplicitAny: 测试用 mock 工具
const createArrayParamTool = (): any => ({
  name: "batchProcess",
  description: "批量处理工具",
  whenToUse: "当需要批量处理多个项目时使用",
  params: [{
    name: "items", optional: false, description: "要处理的项目列表", type: "array",
    params: [{
      name: "item", optional: false, description: "单个项目", type: "object",
      params: [
        { name: "id", optional: false, description: "项目ID", type: "string" },
        { name: "value", optional: false, description: "项目值", type: "string" },
      ],
    }],
  }],
  useExamples: [`<batchProcess><items><item><id>1</id><value>a</value></item></items></batchProcess>`],
  // biome-ignore lint/suspicious/noExplicitAny: 测试用
  invoke: async ({ params }: any) => ({
    message: `批量处理完成，共 ${params.items?.length || 0} 个项目`,
    toolResult: { processed: params.items },
  }),
});

describe("SDK 完整流程集成测试", () => {
  const testStoragePath = path.join(process.cwd(), "test-storage-integration");

  beforeEach(() => {
    setGlobalState("globalStoragePath", testStoragePath);
    // biome-ignore lint/suspicious/noExplicitAny: 测试用
    setGlobalState("registryTools", [] as any);
    // biome-ignore lint/suspicious/noExplicitAny: 测试用
    setGlobalState("registryMessages", [] as any);
  });

  afterEach(() => {
    if (existsSync(testStoragePath)) {
      rmSync(testStoragePath, { recursive: true, force: true });
    }
  });

  describe("阶段 1: 工具注册", () => {
    test("注册自定义工具到 ToolRegistry", () => {
      const registry = new ToolRegistry();
      registry.register(createTestTool("customTool1"));
      registry.register(createTestTool("customTool2"));

      expect(registry.size).toBe(2);
      expect(registry.has("customTool1")).toBe(true);
      expect(registry.has("customTool2")).toBe(true);
    });

    test("将注册的工具存储到 globalState", () => {
      const registry = new ToolRegistry();
      registry.register(createTestTool("sdkTool"));
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      setGlobalState("registryTools", registry.getAll() as any);

      const storedTools = getGlobalState("registryTools");
      expect(storedTools?.length).toBe(1);
      expect(String(storedTools?.[0]?.name)).toBe("sdkTool");
    });

    test("注册消息类型到 MessageRegistry", () => {
      const registry = new MessageRegistry();
      const { z } = require("zod");
      registry.register({
        type: "customNotification",
        schema: z.object({
          type: z.literal("customNotification"),
          data: z.object({ title: z.string() }),
        }),
      });

      expect(registry.size).toBe(1);
      expect(registry.has("customNotification")).toBe(true);
    });
  });

  describe("阶段 2: ToolService 工具解析与执行", () => {
    test("初始化 ToolService 并获取所有工具名称", () => {
      const toolService = new ToolService(BASIC_TOOLS, [createTestTool("myTool")]);
      expect(toolService.toolNames).toContain("myTool");
      expect(toolService.toolNames).toContain("askFollowupQuestion");
    });

    test("解析简单的 XML 工具调用", () => {
      const toolService = new ToolService([], [createTestTool("simpleTool")]);
      const { params, toolName, error } = toolService.parseParams("<simpleTool><input>hello</input></simpleTool>");

      expect(error).toBeUndefined();
      expect(toolName).toBe("simpleTool");
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      expect((params as any).input).toBe("hello");
    });

    test("解析带可选参数的 XML 工具调用", () => {
      const toolService = new ToolService([], [createTestTool("optionalTool")]);
      const { params, toolName } = toolService.parseParams(
        "<optionalTool><input>test</input><options>debug=true</options></optionalTool>"
      );

      expect(toolName).toBe("optionalTool");
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      const p = params as any;
      expect(p.input).toBe("test");
      expect(p.options).toBe("debug=true");
    });

    test("解析数组参数的 XML 工具调用", () => {
      const toolService = new ToolService([], [createArrayParamTool()]);
      const { params, toolName } = toolService.parseParams(`<batchProcess>
        <items><item><id>1</id><value>first</value></item><item><id>2</id><value>second</value></item></items>
      </batchProcess>`);

      expect(toolName).toBe("batchProcess");
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      const p = params as any;
      expect(p.items).toHaveLength(2);
      // XML 解析器会将纯数字字符串解析为数字类型
      expect(p.items[0]).toEqual({ id: 1, value: "first" });
    });

    test("执行工具并返回结果", async () => {
      const executionLog: string[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      const tool = createTestTool("executableTool", async ({ params }: any) => {
        executionLog.push(`executed with: ${params.input}`);
        return { message: "执行成功", toolResult: { executed: true } };
      });

      const toolService = new ToolService([], [tool]);
      const res = await toolService.parseAndExecute({
        xmlParams: "<executableTool><input>test</input></executableTool>",
        getCurrentTask: () => "test-task-id",
      });

      expect(res.error).toBeUndefined();
      expect(res.message).toBe("执行成功");
      expect(executionLog).toContain("executed with: test");
    });

    test("处理工具执行错误", async () => {
      const tool = createTestTool("errorTool", async () => { throw new Error("工具执行失败"); });
      const toolService = new ToolService([], [tool]);

      const res = await toolService.parseAndExecute({
        xmlParams: "<errorTool><input>x</input></errorTool>",
        getCurrentTask: () => "test-task-id",
      });

      expect(res.error).toBeDefined();
      expect(res.error).toContain("工具执行错误");
    });

    test("处理不存在的工具调用", async () => {
      const toolService = new ToolService([], []);
      const res = await toolService.parseAndExecute({
        xmlParams: "<nonExistentTool><input>test</input></nonExistentTool>",
        getCurrentTask: () => "test-task-id",
      });

      expect(res.error).toBeDefined();
      expect(res.error).toContain("不存在");
    });

    test("处理缺少必需参数的工具调用", async () => {
      const toolService = new ToolService([], [createTestTool("requiredParamTool")]);
      const res = await toolService.parseAndExecute({
        xmlParams: "<requiredParamTool></requiredParamTool>",
        getCurrentTask: () => "test-task-id",
      });

      expect(res.error).toBeDefined();
      expect(res.error).toContain("缺少必需参数");
    });
  });


  describe("阶段 3: FilePersistedMemory 消息管理", () => {
    test("创建新的 Memory 实例", () => {
      const taskId = uuidV4();
      const memory = new FilePersistedMemory(taskId);

      expect(memory.currentTaskId).toBe(taskId);
      expect(memory.isNewSession()).toBe(true);
      expect(memory.messages).toHaveLength(0);
    });

    test("添加和持久化消息", () => {
      const taskId = uuidV4();
      const memory = new FilePersistedMemory(taskId);

      memory.addMessage({ role: "system", content: "你是一个助手", type: "system", partial: false });
      memory.addMessage({ role: "user", content: "你好", type: "userSendMessage", partial: false });

      expect(memory.messages).toHaveLength(2);
      expect(memory.messages[0]?.role).toBe("system");
      expect(memory.messages[1]?.content).toBe("你好");
      expect(existsSync(path.join(testStoragePath, taskId, "original.json"))).toBe(true);
    });

    test("从文件恢复 Memory", () => {
      const taskId = uuidV4();
      const memory1 = new FilePersistedMemory(taskId);
      memory1.addMessage({ role: "user", content: "测试消息", type: "userSendMessage", partial: false });

      const memory2 = new FilePersistedMemory(taskId);
      expect(memory2.messages).toHaveLength(1);
      expect(memory2.messages[0]?.content).toBe("测试消息");
      expect(memory2.isNewSession()).toBe(false);
    });

    test("管理会话状态", () => {
      const taskId = uuidV4();
      const memory = new FilePersistedMemory(taskId);

      expect(memory.conversationStatus).toBe("idle");
      memory.conversationStatus = "streaming";
      expect(memory.conversationStatus).toBe("streaming");

      const memory2 = new FilePersistedMemory(taskId);
      expect(memory2.conversationStatus).toBe("streaming");
    });

    test("处理 partial 消息的覆盖", () => {
      const taskId = uuidV4();
      const memory = new FilePersistedMemory(taskId);

      memory.addMessage({ role: "assistant", content: "正在思考", type: "message", partial: true });
      expect(memory.messages).toHaveLength(1);

      memory.addMessage({ role: "assistant", content: "正在思考中...", type: "message", partial: true });
      expect(memory.messages).toHaveLength(1);
      expect(memory.messages[0]?.content).toBe("正在思考中...");

      memory.addMessage({ role: "assistant", content: "思考完成", type: "message", partial: false });
      expect(memory.messages).toHaveLength(1);
      expect(memory.messages[0]?.content).toBe("思考完成");
    });

    test("管理 WebSocket 消息", () => {
      const taskId = uuidV4();
      const memory = new FilePersistedMemory(taskId);

      memory.addWebsocketMessage({
        type: "userSendMessage",
        data: { message: "用户消息", taskId, updateTime: Date.now() },
      });

      const wsMessages = memory.getWebsocketMessages();
      expect(wsMessages).toHaveLength(1);
      expect(wsMessages[0]?.type).toBe("userSendMessage");
    });

    test("管理子任务的工具名称", () => {
      const taskId = uuidV4();
      const parentTaskId = uuidV4();
      const memory = new FilePersistedMemory(taskId, parentTaskId);

      memory.setToolNames(["tool1", "tool2"]);
      expect(memory.toolNames).toEqual(["tool1", "tool2"]);
      expect(memory.getFatherTaskId).toBe(parentTaskId);

      const memory2 = new FilePersistedMemory(taskId, parentTaskId);
      expect(memory2.toolNames).toEqual(["tool1", "tool2"]);
    });
  });

  describe("阶段 4: 完整流程集成", () => {
    test("工具注册 -> ToolService -> Memory 完整流程", async () => {
      // 1. 注册工具
      const registry = new ToolRegistry();
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      registry.register(createTestTool("integrationTool", async ({ params }: any) => ({
        message: `集成测试执行: ${params.input}`,
        toolResult: { integrated: true },
      })));

      // 2. 将工具存储到 globalState
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      setGlobalState("registryTools", registry.getAll() as any);

      // 3. 创建 ToolService
      const registeredTools = getGlobalState("registryTools") || [];
      const toolService = new ToolService(BASIC_TOOLS, registeredTools);
      expect(toolService.toolNames).toContain("integrationTool");

      // 4. 创建 Memory 并模拟会话
      const taskId = uuidV4();
      const memory = new FilePersistedMemory(taskId);
      memory.addMessage({ role: "system", content: "系统提示词", type: "system", partial: false });
      memory.addMessage({ role: "user", content: "请执行集成测试", type: "userSendMessage", partial: false });

      // 5. 执行工具
      const res = await toolService.parseAndExecute({
        xmlParams: "<integrationTool><input>集成测试输入</input></integrationTool>",
        getCurrentTask: () => taskId,
      });

      expect(res.error).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      expect((res.toolResult as any).integrated).toBe(true);

      // 6. 记录工具执行结果
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      memory.addMessage({ role: "assistant", content: JSON.stringify(res.toolResult), type: "integrationTool" as any, partial: false });

      // 7. 验证完整消息历史
      expect(memory.messages).toHaveLength(3);
      expect(memory.messages[0]?.role).toBe("system");
      expect(memory.messages[1]?.role).toBe("user");
      expect(memory.messages[2]?.role).toBe("assistant");
    });

    test("多工具注册和选择性执行", async () => {
      const registry = new ToolRegistry();
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      registry.register(createTestTool("searchTool", async ({ params }: any) => ({
        message: "搜索完成", toolResult: { results: [`搜索: ${params.input}`] },
      })));
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      registry.register(createTestTool("calculateTool", async ({ params }: any) => ({
        message: "计算完成", toolResult: { result: `计算: ${params.input}` },
      })));

      const toolService = new ToolService([], registry.getAll());

      const searchRes = await toolService.parseAndExecute({
        xmlParams: "<searchTool><input>AI</input></searchTool>",
        getCurrentTask: () => "task-1",
      });
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      expect((searchRes.toolResult as any).results).toEqual(["搜索: AI"]);

      const calcRes = await toolService.parseAndExecute({
        xmlParams: "<calculateTool><input>1+1</input></calculateTool>",
        getCurrentTask: () => "task-1",
      });
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      expect((calcRes.toolResult as any).result).toBe("计算: 1+1");
    });

    test("工具执行上下文传递", async () => {
      let capturedTaskId = "";
      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      let capturedGetToolFromName: any = null;

      // biome-ignore lint/suspicious/noExplicitAny: 测试用
      const contextAwareTool = createTestTool("contextTool", async (context: any) => {
        capturedTaskId = context.getCurrentTask();
        capturedGetToolFromName = context.getToolFromName;
        return { message: "上下文捕获成功", toolResult: { taskId: capturedTaskId } };
      });

      const toolService = new ToolService([], [contextAwareTool, createTestTool("helperTool")]);

      await toolService.parseAndExecute({
        xmlParams: "<contextTool><input>test</input></contextTool>",
        getCurrentTask: () => "my-task-123",
      });

      expect(capturedTaskId).toBe("my-task-123");
      expect(capturedGetToolFromName).toBeTruthy();
      expect(capturedGetToolFromName("helperTool")?.name).toBe("helperTool");
    });
  });
});
