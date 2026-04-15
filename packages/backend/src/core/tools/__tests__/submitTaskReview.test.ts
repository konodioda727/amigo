import { describe, expect, it } from "bun:test";
import { SubmitTaskReview } from "../submitTaskReview";

describe("SubmitTaskReview", () => {
  it("accepts approve decisions", async () => {
    const result = await SubmitTaskReview.invoke({
      params: {
        decision: "approve",
        summary: "实现与验证一致",
      },
      context: {} as never,
    });

    expect(result.transport.result).toMatchObject({
      success: true,
      decision: "approve",
      summary: "实现与验证一致",
    });
  });

  it("rejects invalid decisions", async () => {
    const result = await SubmitTaskReview.invoke({
      params: {
        decision: "defer",
        summary: "不应通过",
      } as never,
      context: {} as never,
    });

    expect(result.transport.result.success).toBe(false);
    expect(result.transport.result.message).toContain("只能是 approve 或 request_changes");
  });
});
