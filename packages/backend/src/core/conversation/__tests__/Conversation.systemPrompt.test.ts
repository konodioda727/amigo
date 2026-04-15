import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AmigoLlm } from "@/core/model";
import { ToolService } from "@/core/tools";
import { createExecutionWorkerWorkflowState } from "@/core/workflow";
import { setGlobalState } from "@/globalState";
import { Conversation } from "../Conversation";

mock.module("@/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

describe("Conversation system prompt overrides", () => {
  let tempStorageRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-system-prompt-"));
    setGlobalState("globalStoragePath", tempStorageRoot);
    setGlobalState("conversationPersistenceProvider", {
      exists: () => false,
      load: () => null,
      save: () => true,
      delete: () => true,
      listConversationRelations: () => [],
      listSessionHistories: () => [],
    });
    setGlobalState("extraSystemPrompt", "");
    setGlobalState("extraSystemPrompts", {});
    setGlobalState("ruleProvider", undefined);
    setGlobalState("systemPrompts", {});
  });

  afterEach(() => {
    rmSync(tempStorageRoot, { recursive: true, force: true });
    setGlobalState("conversationPersistenceProvider", undefined);
    setGlobalState("extraSystemPrompt", "");
    setGlobalState("extraSystemPrompts", {});
    setGlobalState("ruleProvider", undefined);
    setGlobalState("systemPrompts", {});
  });

  it("uses configured controller system prompt and still appends extra prompt", () => {
    const overridePrompt = "CONTROLLER OVERRIDE PROMPT";
    const extraPrompt = "APPENDIX PROMPT";
    const toolService = new ToolService([], []);

    setGlobalState("systemPrompts", { controller: overridePrompt });
    setGlobalState("extraSystemPrompt", extraPrompt);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain(overridePrompt);
    expect(systemPrompt).toContain(extraPrompt);
    expect(conversation.memory.messages).toHaveLength(1);
    expect(conversation.memory.messages[0]?.role).toBe("user");
    expect(conversation.memory.messages[0]?.type).toBe("system");
    expect(conversation.memory.messages[0]?.content || "").toContain("[WorkflowState]");
  });

  it("keeps worker prompts free of inherited appendices", () => {
    const toolService = new ToolService([], []);

    setGlobalState("extraSystemPrompts", {
      controller: "CONTROLLER SCOPED PROMPT",
      worker: "WORKER SCOPED PROMPT",
    });

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
      workflowState: createExecutionWorkerWorkflowState(),
      context: {
        systemPromptAppendix: {
          worker: "WORKER CONTEXT APPENDIX",
        },
      },
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).not.toContain("WORKER SCOPED PROMPT");
    expect(systemPrompt).not.toContain("WORKER CONTEXT APPENDIX");
    expect(systemPrompt).not.toContain("CONTROLLER SCOPED PROMPT");
  });

  it("still appends controller extras for controller prompts", () => {
    const toolService = new ToolService([], []);

    setGlobalState("extraSystemPrompts", {
      controller: "CONTROLLER SCOPED PROMPT",
      worker: "WORKER SCOPED PROMPT",
    });

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
      context: {
        systemPromptAppendix: {
          controller: "CONTROLLER CONTEXT APPENDIX",
        },
      },
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain("CONTROLLER SCOPED PROMPT");
    expect(systemPrompt).toContain("CONTROLLER CONTEXT APPENDIX");
    expect(systemPrompt).not.toContain("WORKER SCOPED PROMPT");
  });

  it("keeps worker prompts compact and execution-focused", () => {
    const toolService = new ToolService([], []);

    const workerConversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
      workflowState: createExecutionWorkerWorkflowState(),
    });
    const controllerConversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
    });

    const workerPrompt = workerConversation.memory.initialSystemPrompt || "";
    const controllerPrompt = controllerConversation.memory.initialSystemPrompt || "";

    expect(workerPrompt).toContain("execution_worker");
    expect(workerPrompt).toContain("执行子任务的 agent");
    expect(workerPrompt).toContain("父任务继承下来的上下文");
    expect(workerPrompt).toContain("不要把它当成文件编辑器");
    expect(workerPrompt).toContain("只做分配给你的执行范围");
    expect(workerPrompt).not.toContain("task docs");
    expect(workerPrompt).not.toContain("sandbox's relevant directory structure");
    expect(workerPrompt.length).toBeLessThan(controllerPrompt.length);
  });

  it("uses completeTask for main task turn endings", () => {
    const toolService = new ToolService([], []);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain("`completeTask`");
    expect(systemPrompt).toContain("每一轮回复都必须以工具调用结束");
    expect(systemPrompt).toContain("必须先用 `bash` 实际运行必要检查");
    expect(systemPrompt).toContain("正式交付最终结果");
  });

  it("keeps the main prompt tool-driven and completeTask-oriented without forcing tool preambles", () => {
    const toolService = new ToolService([], []);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).not.toContain(
      "Before the first tool call of a new investigation/execution phase",
    );
    expect(systemPrompt).toContain("每一轮回复都必须以工具调用结束");
    expect(systemPrompt).toContain("持久记忆以会话历史");
    expect(systemPrompt).toContain("`taskList`");
    expect(systemPrompt).toContain("taskList(action=execute)");
    expect(systemPrompt).toContain("异步结果不一定在同一轮立即返回");
    expect(systemPrompt).toContain("很短的 `bash` 等待");
    expect(systemPrompt).toContain("`askFollowupQuestion`");
    expect(systemPrompt).toContain("最高优先级指令");
    expect(systemPrompt).not.toContain(
      "explicitly ask the user for solution preferences/opinions through `askFollowupQuestion` before finalizing the plan",
    );
  });

  it("keeps phase priority above generic investigation or questioning habits", () => {
    const toolService = new ToolService([], []);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain("运行时给出的 mode、phase、workflow notice 优先级最高");
    expect(systemPrompt).toContain("用户到底要什么");
    expect(systemPrompt).toContain("只有用户本人才能提供的事实、偏好或取舍会阻塞推进时");
    expect(systemPrompt).toContain("checkpoint/compaction 和各阶段 `completeTask`");
    expect(systemPrompt).toContain("先服从它，再参考通用规则");
    expect(systemPrompt).toContain("向用户索取你可以自行查看的文件、日志、路径、代码或环境信息");
    expect(systemPrompt).toContain("先修正并重试同一个工具");
    expect(systemPrompt).toContain("先用 1-2 句高信息量正文说明你要做什么、为什么");
  });

  it("includes the universal SOP and mode-specific explicitness rules", () => {
    const toolService = new ToolService([], []);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain("工作方式");
    expect(systemPrompt).toContain("用户真正要什么");
    expect(systemPrompt).toContain("Fast Mode");
    expect(systemPrompt).toContain("phased workflow");
    expect(systemPrompt).toContain("先看真实工作区");
    expect(systemPrompt).toContain("尽量用更少的轮次把用户请求做完");
    expect(systemPrompt).toContain("最高优先级指令");
    expect(systemPrompt).toContain("简单、低风险、连续性强的任务优先走 fast mode");
    expect(systemPrompt).toContain("controller 在 phased workflow 中固定按完整阶段集推进");
    expect(systemPrompt).toContain("`taskList`");
    expect(systemPrompt).toContain("taskList(action=execute)");
    expect(systemPrompt).toContain("design 阶段生成 `taskList`");
    expect(systemPrompt).toContain("不强制拆成 requirements、design、execution、verification");
    expect(systemPrompt).toContain("必须先用 `bash` 实际运行必要检查");
    expect(systemPrompt).toContain("调用 `completeTask` 结束主任务");
    expect(systemPrompt).not.toContain(
      "questions about how the current system/workflow behaves: ALWAYS investigate first",
    );
    expect(systemPrompt).not.toContain(
      "`findings.md` is the rolling record of confirmed facts, evidence, open questions, and decision impact",
    );
    expect(systemPrompt).not.toContain(
      "在收敛方案前，必须调用 `askFollowupQuestion` 询问用户对方案、取舍、风格或优先级的偏好和意见",
    );
    expect(systemPrompt).not.toContain("In discovery, do not batch findings until the end");
    expect(systemPrompt).not.toContain(
      "Both modes require investigation first, then `completeTask` to report, then wait for user approval before implementation.",
    );
  });

  it("appends host rule references into the core prompt when a rule provider is configured", () => {
    const toolService = new ToolService([], []);
    const ruleProvider = {
      getSystemPromptAppendix: ({ promptScope }) =>
        promptScope === "controller" ? "APP DIRECTORY APPENDIX" : undefined,
      getPromptReferences: ({ promptScope }) =>
        promptScope === "controller"
          ? [
              {
                id: "coding",
                title: "Coding Rules",
                whenToRead: "task involves code changes",
                scopes: ["controller"],
              },
            ]
          : [],
      getRule: async () => null,
    };

    setGlobalState("ruleProvider", ruleProvider);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain("APP DIRECTORY APPENDIX");
    expect(systemPrompt).toContain("ON-DEMAND RULE DOCS");
    expect(systemPrompt).toContain("Do NOT use `readFile` for them");
    expect(systemPrompt).toContain("| `coding` | task involves code changes |");
  });
});
