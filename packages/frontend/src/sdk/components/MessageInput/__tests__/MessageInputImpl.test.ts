import { describe, expect, it } from "bun:test";
import { resolveMessageInputButtonState } from "../MessageInputImpl";

describe("resolveMessageInputButtonState", () => {
  it("keeps streaming tasks on stop", () => {
    expect(
      resolveMessageInputButtonState({
        taskStatus: "streaming",
        hasDraftContent: false,
      }),
    ).toBe("stop");
  });

  it("shows resume for interrupted tasks without a draft", () => {
    expect(
      resolveMessageInputButtonState({
        taskStatus: "interrupted",
        hasDraftContent: false,
      }),
    ).toBe("resume");
  });

  it("lets interrupted tasks send when the user has drafted a new message", () => {
    expect(
      resolveMessageInputButtonState({
        taskStatus: "interrupted",
        hasDraftContent: true,
      }),
    ).toBe("send");
  });

  it("uses send for completed tasks", () => {
    expect(
      resolveMessageInputButtonState({
        taskStatus: "completed",
        hasDraftContent: false,
      }),
    ).toBe("send");
  });
});
