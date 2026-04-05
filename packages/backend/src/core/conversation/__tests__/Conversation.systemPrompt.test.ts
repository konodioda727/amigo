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

  it("uses direct final answers for main task turn endings", () => {
    const toolService = new ToolService([], []);

    const conversation = Conversation.create({
      toolService,
      llm: {} as unknown as AmigoLlm,
      type: "main",
    });

    const systemPrompt = conversation.memory.initialSystemPrompt || "";
    expect(systemPrompt).toContain("respond directly with the final answer");
    expect(systemPrompt).toContain("async tool");
    expect(systemPrompt).toContain("background work has started");
  });

  it("keeps the main prompt delta-first and citation-oriented without forcing tool preambles", () => {
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
    expect(systemPrompt).toContain("what you are about to do");
    expect(systemPrompt).toContain("what is newly changing since the last user-visible update");
    expect(systemPrompt).toContain("go straight to the tool call");
    expect(systemPrompt).toContain("Do not repeat near-identical progress updates");
    expect(systemPrompt).toContain("delta-first");
    expect(systemPrompt).toContain(
      "Every active turn that is still working MUST contain at least one tool call",
    );
    expect(systemPrompt).toContain(
      "Plain assistant text alone is never a valid ending for an active turn that is still working",
    );
    expect(systemPrompt).toContain("[citation: path/to/file]");
    expect(systemPrompt).toContain("Do not invent citations");
  });
});
