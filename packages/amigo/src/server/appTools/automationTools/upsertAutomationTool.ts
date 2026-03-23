import { conversationRepository } from "@amigo-llm/backend";
import type { ToolInterface } from "@amigo-llm/types";
import type { z } from "zod";
import type { AutomationScheduler } from "../../automations/automationScheduler";
import { type AutomationStore, AutomationUpsertSchema } from "../../automations/automationStore";

const UpsertAutomationToolInputSchema = AutomationUpsertSchema;

type UpsertAutomationToolInput = z.infer<typeof UpsertAutomationToolInputSchema>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const extractFeishuContext = (context: unknown): Record<string, unknown> | undefined => {
  if (!isPlainObject(context) || !isPlainObject(context.feishu)) {
    return undefined;
  }
  return context.feishu;
};

const mergeAutomationContext = (
  currentConversationContext: unknown,
  inputContext: Record<string, unknown> | undefined,
  sourceTaskId: string | undefined,
) => {
  const feishuContext = extractFeishuContext(currentConversationContext);
  const mergedContext: Record<string, unknown> = {
    ...(inputContext || {}),
  };
  if (feishuContext && !(inputContext && isPlainObject(inputContext.feishu))) {
    mergedContext.feishu = feishuContext;
  }
  if (sourceTaskId && typeof mergedContext.sourceTaskId !== "string") {
    mergedContext.sourceTaskId = sourceTaskId;
  }
  return Object.keys(mergedContext).length > 0 ? mergedContext : undefined;
};

export const createUpsertAutomationTool = (
  automationStore: AutomationStore,
  automationScheduler: AutomationScheduler,
): ToolInterface<string> => ({
  name: "upsertAutomation",
  description: "创建或更新一个服务端 automation。适合用户要求定时、周期性、重复执行任务时使用。",
  whenToUse:
    "当用户明确要求自动化、定时执行、未来某个时间提醒、每天/每周/每隔一段时间重复执行某个任务时，直接调用这个工具创建或更新 automation，不要让用户手动去管理页创建。若用户只要求执行一次，优先使用 once，而不是 interval/daily/weekly。解析未明确上午/下午的时间时，要结合当前本地时间和上下文推断更合理的未来时间；若歧义仍然明显，再先追问。",
  params: [
    {
      name: "id",
      optional: true,
      description:
        "automation ID。更新已有 automation 时传入；新建时可省略，系统会根据 name 生成。",
    },
    {
      name: "name",
      optional: false,
      description: "automation 名称，简短清晰。",
    },
    {
      name: "prompt",
      optional: false,
      description: "automation 每次运行时发送给模型的任务内容。",
    },
    {
      name: "skillIds",
      optional: true,
      type: "array",
      description: "可选：automation 运行时附带的 skill ID 列表。",
      params: [
        {
          name: "skillId",
          optional: false,
          description: "单个 skill ID",
        },
      ],
    },
    {
      name: "schedule",
      optional: false,
      type: "object",
      description:
        "调度配置。支持 once、interval、daily、weekly 四种类型。单次提醒优先用 once。对“6:50”这类未明确上午/下午的时间，要结合当前本地时间和上下文推断，优先选择更合理的未来时间；仍有明显歧义时再追问。",
      params: [
        {
          name: "type",
          optional: false,
          description: "调度类型：once | interval | daily | weekly",
        },
        {
          name: "afterMinutes",
          optional: true,
          description: "当 type=once 时必填，表示基于当前本地时间，多少分钟后执行一次并自动停用。",
        },
        {
          name: "everyMinutes",
          optional: true,
          description: "当 type=interval 时必填，表示每隔多少分钟执行一次。",
        },
        {
          name: "hour",
          optional: true,
          description:
            "当 type=daily 或 weekly 时使用，0-23，使用 24 小时制。例如晚上 6:50 应写为 hour=18、minute=50；若用户只说 6:50，要先结合当前本地时间和语境判断是 6:50 还是 18:50。",
        },
        {
          name: "minute",
          optional: true,
          description: "当 type=daily 或 weekly 时使用，0-59。",
        },
        {
          name: "weekday",
          optional: true,
          description: "当 type=weekly 时必填，0-6 分别表示周日到周六。",
        },
      ],
    },
    {
      name: "enabled",
      optional: true,
      description: "是否启用 automation，默认 true。",
    },
    {
      name: "context",
      optional: true,
      type: "object",
      description: "可选：额外上下文对象，会在 automation 运行时注入。",
      params: [],
    },
  ],
  async invoke({ params, context }) {
    const input = UpsertAutomationToolInputSchema.parse(params as UpsertAutomationToolInput);
    const conversation =
      conversationRepository.get(context.taskId) || conversationRepository.load(context.taskId);
    const sourceTaskId = (context.parentId || context.taskId || "").trim() || undefined;
    const mergedContext = mergeAutomationContext(
      conversation?.memory.context,
      input.context as Record<string, unknown> | undefined,
      sourceTaskId,
    );
    const automation = await automationStore.upsert({
      ...input,
      ...(mergedContext ? { context: mergedContext } : {}),
    });
    await automationScheduler.refreshSchedule();
    const action = input.id?.trim() ? "更新" : "创建";
    return {
      message: `已${action} automation: ${automation.name}`,
      toolResult: {
        success: true,
        action,
        message: `已${action} automation: ${automation.name}`,
        automation,
      },
    };
  },
});
