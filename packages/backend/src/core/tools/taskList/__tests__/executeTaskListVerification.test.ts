import { describe, expect, it } from "bun:test";
import { __testing__ } from "../executeTaskListVerification";

describe("executeTaskListVerification", () => {
  it("treats defer as a bypass instead of forced rework", () => {
    expect(__testing__.shouldBypassInternalReview("defer")).toBe(true);
    expect(__testing__.shouldBypassInternalReview("approve")).toBe(false);
    expect(__testing__.shouldBypassInternalReview("request_changes")).toBe(false);
  });
});
