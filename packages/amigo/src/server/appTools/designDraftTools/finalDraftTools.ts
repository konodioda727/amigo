import { defineTool } from "@amigo-llm/backend";
import { resolveDesignDocOwnerTaskId } from "../designDocTools/designDocScope";
import { normalizeId, toFinalDraftDetail } from "./shared";
import { readStoredFinalDesignDraft } from "./storage";

export const readFinalDesignDraftTool = defineTool({
  name: "readFinalDesignDraft",
  description: "读取单个最终界面草稿。",
  whenToUse:
    "当 orchestrateFinalDesignDraft 已经装配出 final draft 后，用于读取某个最终界面的 HTML + Tailwind 内容、来源布局和来源主题。若 draft 尚不存在，不要反复查询；应先确保 orchestrateFinalDesignDraft 已被调用。",
  params: [{ name: "draftId", optional: false, description: "最终草稿 ID" }],
  async invoke({ params, context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        error: message,
        toolResult: { success: false, draft: null, validationErrors: [message], message },
      };
    }

    const draftId = typeof params.draftId === "string" ? normalizeId(params.draftId) : "";
    const draft = draftId ? readStoredFinalDesignDraft(ownerTaskId, draftId) : null;
    const message = draft ? `已读取最终界面草稿 ${draft.draftId}` : `未找到最终界面草稿 ${draftId}`;
    return {
      message,
      ...(draft ? {} : { error: message }),
      toolResult: {
        success: Boolean(draft),
        draft: draft ? toFinalDraftDetail(ownerTaskId, draft) : null,
        validationErrors: draft ? [] : [message],
        message,
      },
    };
  },
});
