import { SkillUpsertSchema } from "@amigo-llm/backend";
import type { SkillStore } from "../../skills/skillStore";
import { parseJsonBody } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

export const listSkillsController = async (skillStore: SkillStore) => {
  try {
    return jsonResponse(await skillStore.list());
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "LIST_SKILLS_FAILED",
      logLabel: "[AmigoHttp] list skills 失败",
    });
  }
};

export const getSkillController = async (skillStore: SkillStore, skillId: string) => {
  try {
    const skill = await skillStore.get(skillId);
    return skill
      ? jsonResponse(skill)
      : jsonResponse(
          { error: `skill ${skillId} 不存在`, code: "SKILL_NOT_FOUND" },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "GET_SKILL_FAILED",
      logLabel: "[AmigoHttp] get skill 失败",
    });
  }
};

export const upsertSkillController = async (req: Request, skillStore: SkillStore) => {
  try {
    const body = await parseJsonBody(req, SkillUpsertSchema, "INVALID_SKILL_REQUEST");
    return jsonResponse(await skillStore.upsert(body));
  } catch (error) {
    return errorResponse(error, {
      status: 400,
      code: "UPSERT_SKILL_FAILED",
      logLabel: "[AmigoHttp] upsert skill 失败",
    });
  }
};

export const deleteSkillController = async (skillStore: SkillStore, skillId: string) => {
  try {
    const removed = await skillStore.remove(skillId);
    return removed
      ? jsonResponse({ success: true })
      : jsonResponse(
          { error: `skill ${skillId} 不存在`, code: "SKILL_NOT_FOUND" },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "DELETE_SKILL_FAILED",
      logLabel: "[AmigoHttp] delete skill 失败",
    });
  }
};
