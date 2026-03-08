import { describe, expect, it, mock } from "bun:test";
import { handleStateChange } from "../stateChangeHandler";

const toastSuccess = mock();
const toastInfo = mock();
const toastWarning = mock();
const toastError = mock();

mock.module("@/utils/toast", () => ({
  toast: {
    success: toastSuccess,
    info: toastInfo,
    warning: toastWarning,
    error: toastError,
  },
}));

describe("handleStateChange alert handling", () => {
  it("shows toast-only alerts without adding them to display messages", () => {
    const store = {
      mainTaskId: "task-1",
      setCreatingConversation: mock(),
      setTaskStatus: mock(),
    } as any;

    const handled = handleStateChange(
      {
        type: "alert",
        data: {
          message: "Task 1.2 已完成",
          severity: "success",
          toastOnly: true,
        },
      } as any,
      store,
    );

    expect(toastSuccess).toHaveBeenCalledWith("Task 1.2 已完成");
    expect(handled).toBe(true);
  });
});
