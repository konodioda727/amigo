import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AmigoLlm } from "@/core/model";
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
    setGlobalState("systemPrompts", {});
  });

  afterEach(() => {
    rmSync(tempStorageRoot, { recursive: true, force: true });
    setGlobalState("conversationPersistenceProvider", undefined);
    setGlobalState("extraSystemPrompt", "");
    setGlobalState("extraSystemPrompts", {});
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
    expect(systemPrompt).toContain(
      "Every active turn that is still working MUST contain at least one tool call",
    );
    expect(systemPrompt).toContain(
      "Plain assistant text alone is never a valid ending for an active turn that is still working",
    );
    expect(systemPrompt).toContain("background work has started");
  });
});
