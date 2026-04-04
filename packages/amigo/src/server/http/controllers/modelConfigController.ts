import { getGlobalState, type ModelSelection } from "@amigo-llm/backend";
import { z } from "zod";
import type { PublicModelConfig, UserModelConfigUpsertInput } from "../../modelConfigs/store";
import {
  readPublicUserModelConfigSettings,
  upsertUserModelConfigSettings,
} from "../../modelConfigs/store";
import { parseJsonBody } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

const ProviderModelConfigSchema = z.object({
  name: z.string().trim().min(1),
  contextWindow: z.number().int().positive().optional(),
  thinkType: z.string().trim().min(1).optional(),
});

const PublicModelConfigSchema: z.ZodType<PublicModelConfig> = z.object({
  provider: z.string().trim().min(1),
  apiKey: z.literal(""),
  hasApiKey: z.boolean(),
  sourceConfigId: z.string().trim().min(1),
  baseURL: z.string().trim().min(1).optional(),
  models: z.array(ProviderModelConfigSchema).min(1),
  compressionThreshold: z.number().positive().max(1).optional(),
  targetRatio: z.number().positive().max(1).optional(),
  preserveRecentMessages: z.number().int().positive().optional(),
  minMessagesToCompress: z.number().int().positive().optional(),
});

const ModelConfigUpsertSchema: z.ZodType<UserModelConfigUpsertInput["modelConfigs"][string]> =
  z.object({
    provider: z.string().trim().min(1),
    apiKey: z.string().trim().optional(),
    sourceConfigId: z.string().trim().min(1).optional(),
    baseURL: z.string().trim().min(1).optional(),
    models: z.array(ProviderModelConfigSchema).min(1),
    compressionThreshold: z.number().positive().max(1).optional(),
    targetRatio: z.number().positive().max(1).optional(),
    preserveRecentMessages: z.number().int().positive().optional(),
    minMessagesToCompress: z.number().int().positive().optional(),
  });

const ModelSelectionSchema: z.ZodType<ModelSelection> = z.object({
  configId: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1),
});

const PublicUserModelConfigSettingsSchema = z
  .object({
    modelConfigs: z.record(z.string().trim().min(1), PublicModelConfigSchema),
    defaultModel: ModelSelectionSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    const defaultModel = value.defaultModel;
    if (!defaultModel) {
      return;
    }

    const configId = defaultModel.configId?.trim() || "";
    if (!configId || !value.modelConfigs[configId]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultModel", "configId"],
        message: "defaultModel.configId 不存在",
      });
      return;
    }

    const matchedModel = value.modelConfigs[configId].models.some(
      (item) => item.name.trim() === defaultModel.model.trim(),
    );
    if (!matchedModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultModel", "model"],
        message: "defaultModel.model 不存在",
      });
    }
  });

const UserModelConfigUpsertSchema: z.ZodType<UserModelConfigUpsertInput> = z
  .object({
    modelConfigs: z.record(z.string().trim().min(1), ModelConfigUpsertSchema),
    defaultModel: ModelSelectionSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    const defaultModel = value.defaultModel;
    if (!defaultModel) {
      return;
    }

    const configId = defaultModel.configId?.trim() || "";
    if (!configId || !value.modelConfigs[configId]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultModel", "configId"],
        message: "defaultModel.configId 不存在",
      });
      return;
    }

    const matchedModel = value.modelConfigs[configId].models.some(
      (item) => item.name.trim() === defaultModel.model.trim(),
    );
    if (!matchedModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultModel", "model"],
        message: "defaultModel.model 不存在",
      });
    }
  });

type PublicUserModelConfigSettings = z.infer<typeof PublicUserModelConfigSettingsSchema>;

const sanitizeDefaultModelConfigs = (
  modelConfigs: Record<
    string,
    {
      provider: string;
      baseURL?: string;
      models: PublicModelConfig["models"];
      compressionThreshold?: number;
      targetRatio?: number;
      preserveRecentMessages?: number;
      minMessagesToCompress?: number;
      apiKey: string;
    }
  >,
) =>
  Object.fromEntries(
    Object.entries(modelConfigs).map(([configId, config]) => [
      configId,
      {
        ...config,
        apiKey: "",
        hasApiKey: !!config.apiKey.trim(),
        sourceConfigId: configId,
      },
    ]),
  );

const getDefaultSettings = (): PublicUserModelConfigSettings => {
  const defaultConfigs = getGlobalState("modelConfigs") || {};
  return {
    modelConfigs: sanitizeDefaultModelConfigs(defaultConfigs),
    defaultModel: null,
  };
};

export const getUserModelConfigsController = async (userId: string) => {
  try {
    const userSettings = await readPublicUserModelConfigSettings(userId);
    const settings = userSettings || getDefaultSettings();
    return jsonResponse({
      hasUserConfig: !!userSettings,
      ...settings,
    });
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "GET_MODEL_CONFIGS_FAILED",
      logLabel: "[AmigoHttp] 获取模型配置失败",
    });
  }
};

export const upsertUserModelConfigsController = async (req: Request, userId: string) => {
  try {
    const settings = await parseJsonBody(
      req,
      UserModelConfigUpsertSchema,
      "INVALID_MODEL_CONFIGS_REQUEST",
    );
    const saved = await upsertUserModelConfigSettings(userId, {
      ...settings,
      defaultModel: settings.defaultModel || null,
    });
    return jsonResponse({
      hasUserConfig: true,
      ...saved,
    });
  } catch (error) {
    return errorResponse(error, {
      status: 400,
      code: "UPSERT_MODEL_CONFIGS_FAILED",
      logLabel: "[AmigoHttp] 保存模型配置失败",
    });
  }
};
