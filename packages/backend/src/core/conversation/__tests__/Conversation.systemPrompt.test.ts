import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AmigoLlm } from "@/core/model";
import type { RuleProvider } from "@/core/rules";
import { ToolService } from "@/core/tools";
import { setGlobalState } from "@/globalState";
import { Conversation } from "../Conversation";

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

  it("uses configured main system prompt and still appends extra prompt", () => {
    const overridePrompt = "MAIN OVERRIDE PROMPT";
    const extraPrompt = "APPENDIX PROMPT";
    const toolService = new ToolService([], []);

    setGlobalState("systemPrompts", { main: overridePrompt });
    setGlobalState("extraSystemPrompt", extraPrompt);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
      type: "main",
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain(overridePrompt);
    expect(systemPrompt).toContain(extraPrompt);
    expect(conversation.memory.messages).toHaveLength(0);
  });

  it("appends scoped extra prompts and context appendix for the matching conversation type", () => {
    const toolService = new ToolService([], []);

    setGlobalState("extraSystemPrompts", {
      main: "MAIN SCOPED PROMPT",
      sub: "SUB SCOPED PROMPT",
    });

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
      type: "sub",
      context: {
        systemPromptAppendix: {
          sub: "SUB CONTEXT APPENDIX",
        },
      },
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain("SUB SCOPED PROMPT");
    expect(systemPrompt).toContain("SUB CONTEXT APPENDIX");
    expect(systemPrompt).not.toContain("MAIN SCOPED PROMPT");
  });

  it("uses completeTask for main task turn endings", () => {
    const toolService = new ToolService([], []);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
      type: "main",
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain("call `completeTask`");
    expect(systemPrompt).toContain("async tool");
    expect(systemPrompt).toContain("background work has started");
  });

  it("keeps the main prompt tool-driven and completeTask-oriented without forcing tool preambles", () => {
    const toolService = new ToolService([], []);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
      type: "main",
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).not.toContain(
      "Before the first tool call of a new investigation/execution phase",
    );
    expect(systemPrompt).toContain("call `completeTask`");
    expect(systemPrompt).toContain("user-facing");
    expect(systemPrompt).toContain("easy to read");
    expect(systemPrompt).toContain("there is no required sub-task section template");
    expect(systemPrompt).toContain("Every response MUST end with at least one tool call");
    expect(systemPrompt).toContain("Plain assistant text alone is FORBIDDEN");
    expect(systemPrompt).toContain("background work has started");
    expect(systemPrompt).toContain("stop searching and use `completeTask`");
  });

  it("requires repository inspection before answering current-system behavior questions", () => {
    const toolService = new ToolService([], []);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
      type: "main",
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain(
      "questions about how the current repository/app/agent behaves: ALWAYS investigate first",
    );
    expect(systemPrompt).toContain(
      "if the user is asking why the current app/agent/prompt/tool/workflow behaves a certain way, first inspect the relevant local files, prompts, configs, or logs in the sandbox",
    );
    expect(systemPrompt).toContain("Use `askFollowupQuestion` only when a real missing fact");
    expect(systemPrompt).toContain(
      'If you can already answer the user\'s current "why/how does this repo behave?" question from the evidence collected, that is enough to stop investigating',
    );
  });

  it("includes the universal SOP and mode-specific explicitness rules", () => {
    const toolService = new ToolService([], []);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
      type: "main",
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain("UNIVERSAL SOP");
    expect(systemPrompt).toContain("Decompose the task goal");
    expect(systemPrompt).toContain("Gather information before acting");
    expect(systemPrompt).toContain("Produce a preliminary solution based on collected evidence");
    expect(systemPrompt).toContain("Review the result before finishing");
    expect(systemPrompt).toContain("All modes MUST follow the UNIVERSAL SOP defined in IDENTITY.");
    expect(systemPrompt).toContain(
      "The difference between modes is not whether this SOP exists, but whether it stays implicit or must be made explicit as task artifacts.",
    );
    expect(systemPrompt).toContain("`requirements.md` is the explicit task-goal decomposition");
    expect(systemPrompt).toContain(
      "`design.md` is the explicit preliminary solution and tradeoff record",
    );
    expect(systemPrompt).toContain("`taskList.md` is the explicit execution breakdown");
    expect(systemPrompt).toContain(
      "task docs are the explicit, living form of the UNIVERSAL SOP, not a parallel workflow",
    );
    expect(systemPrompt).toContain(
      "If the required facts and user decisions are already clear, you may continue through investigate -> solve -> review in one continuous execution flow",
    );
    expect(systemPrompt).toContain(
      "force an extra approval round in Direct Mode unless the user must make a real decision",
    );
    expect(systemPrompt).toContain(
      "If you're providing investigation findings or a preliminary solution before implementation, end with `completeTask`",
    );
    expect(systemPrompt).not.toContain(
      "Both modes require investigation first, then `completeTask` to report, then wait for user approval before implementation.",
    );
  });

  it("appends host rule references when a rule provider is configured", () => {
    const toolService = new ToolService([], []);
    const ruleProvider: RuleProvider = {
      getSystemPromptAppendix: ({ conversationType }) =>
        conversationType === "main" ? "APP DIRECTORY APPENDIX" : undefined,
      getPromptReferences: ({ conversationType }) =>
        conversationType === "main"
          ? [
              {
                id: "coding",
                title: "Coding Rules",
                whenToRead: "task involves code changes",
                scopes: ["main"],
              },
            ]
          : [],
      getRule: async () => null,
    };

    setGlobalState("ruleProvider", ruleProvider);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
      type: "main",
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain("APP DIRECTORY APPENDIX");
    expect(systemPrompt).toContain("ON-DEMAND RULE DOCS");
    expect(systemPrompt).toContain("Do NOT use `readFile` for them");
    expect(systemPrompt).toContain("| `coding` | task involves code changes |");
  });
});
