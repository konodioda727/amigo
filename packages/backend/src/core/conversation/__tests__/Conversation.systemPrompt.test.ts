import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ToolService } from "@/core/tools";
import { setGlobalState } from "@/globalState";
import { Conversation } from "../Conversation";

describe("Conversation system prompt overrides", () => {
  let tempStorageRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-system-prompt-"));
    setGlobalState("globalStoragePath", tempStorageRoot);
    setGlobalState("extraSystemPrompt", "");
    setGlobalState("systemPrompts", {});
  });

  afterEach(() => {
    rmSync(tempStorageRoot, { recursive: true, force: true });
    setGlobalState("extraSystemPrompt", "");
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
      llm: {} as any,
      type: "main",
    });

    const systemPrompt = conversation.memory.messages[0]?.content || "";
    expect(systemPrompt).toContain(overridePrompt);
    expect(systemPrompt).toContain(extraPrompt);
  });
});
