import { describe, expect, test } from "bun:test";
import { getTaskListStatusMap } from "../DocSidebar";

describe("getTaskListStatusMap", () => {
  test("returns an empty object when the main task status map is not ready yet", () => {
    expect(getTaskListStatusMap({}, "task-main")).toEqual({});
  });

  test("returns an empty object when there is no main task id", () => {
    expect(getTaskListStatusMap({}, null)).toEqual({});
  });

  test("returns the existing status map for the current main task", () => {
    const statusMap = {
      "1.1": {
        description: "Task 1.1: generate module draft",
        status: "running",
        subTaskId: "sub-task-1",
      },
    } as any;

    expect(
      getTaskListStatusMap(
        {
          "task-main": statusMap,
        },
        "task-main",
      ),
    ).toBe(statusMap);
  });
});
