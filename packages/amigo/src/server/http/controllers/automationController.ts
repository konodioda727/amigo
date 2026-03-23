import type { AutomationScheduler } from "../../automations/automationScheduler";
import { type AutomationStore, AutomationUpsertSchema } from "../../automations/automationStore";
import { parseJsonBody } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

export const listAutomationsController = async (automationStore: AutomationStore) => {
  try {
    return jsonResponse(await automationStore.list());
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "LIST_AUTOMATIONS_FAILED",
      logLabel: "[AmigoHttp] list automations 失败",
    });
  }
};

export const getAutomationController = async (
  automationStore: AutomationStore,
  automationId: string,
) => {
  try {
    const automation = await automationStore.get(automationId);
    return automation
      ? jsonResponse(automation)
      : jsonResponse(
          { error: `automation ${automationId} 不存在`, code: "AUTOMATION_NOT_FOUND" },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "GET_AUTOMATION_FAILED",
      logLabel: "[AmigoHttp] get automation 失败",
    });
  }
};

export const upsertAutomationController = async (
  req: Request,
  automationStore: AutomationStore,
  automationScheduler: AutomationScheduler,
) => {
  try {
    const body = await parseJsonBody(req, AutomationUpsertSchema, "INVALID_AUTOMATION_REQUEST");
    const automation = await automationStore.upsert(body);
    await automationScheduler.refreshSchedule();
    return jsonResponse(automation);
  } catch (error) {
    return errorResponse(error, {
      status: 400,
      code: "UPSERT_AUTOMATION_FAILED",
      logLabel: "[AmigoHttp] upsert automation 失败",
    });
  }
};

export const deleteAutomationController = async (
  automationStore: AutomationStore,
  automationScheduler: AutomationScheduler,
  automationId: string,
) => {
  try {
    const removed = await automationStore.remove(automationId);
    await automationScheduler.refreshSchedule();
    return removed
      ? jsonResponse({ success: true })
      : jsonResponse(
          { error: `automation ${automationId} 不存在`, code: "AUTOMATION_NOT_FOUND" },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "DELETE_AUTOMATION_FAILED",
      logLabel: "[AmigoHttp] delete automation 失败",
    });
  }
};

export const runAutomationController = async (
  automationScheduler: AutomationScheduler,
  automationId: string,
) => {
  try {
    const automation = await automationScheduler.runNow(automationId);
    return automation
      ? jsonResponse(automation)
      : jsonResponse(
          { error: `automation ${automationId} 不存在`, code: "AUTOMATION_NOT_FOUND" },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "RUN_AUTOMATION_FAILED",
      logLabel: "[AmigoHttp] run automation 失败",
    });
  }
};
