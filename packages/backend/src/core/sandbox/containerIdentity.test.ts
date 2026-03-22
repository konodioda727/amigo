import { describe, expect, it } from "bun:test";
import { getSandboxContainerName } from "./containerIdentity";

describe("getSandboxContainerName", () => {
  it("returns a deterministic docker-safe container name", () => {
    const taskId = "Task:ABC/123";

    expect(getSandboxContainerName(taskId)).toBe(getSandboxContainerName(taskId));
    expect(getSandboxContainerName(taskId)).toMatch(/^amigo-sandbox-[a-z0-9_.-]+-[a-f0-9]{10}$/);
  });

  it("keeps different task ids collision-resistant", () => {
    expect(getSandboxContainerName("task-a")).not.toBe(getSandboxContainerName("task-b"));
  });
});
