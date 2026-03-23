import { getGlobalState, type ModelConfig, type ModelSelection } from "@amigo-llm/backend";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { ensureMysqlSchemaUpToDate, mysqlExecute, mysqlQuery, parseJsonColumn } from "../../db";
import { parseJsonBody } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

const ProviderModelConfigSchema = z.object({
  name: z.string().trim().min(1),
  contextWindow: z.number().int().positive().optional(),
  thinkType: z.string().trim().min(1).optional(),
});

const ModelConfigSchema: z.ZodType<ModelConfig> = z.object({
  provider: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
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

const UserModelConfigSettingsSchema = z
  .object({
    modelConfigs: z.record(z.string().trim().min(1), ModelConfigSchema),
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

type UserModelConfigSettings = z.infer<typeof UserModelConfigSettingsSchema>;

type UserModelConfigRow = RowDataPacket & {
  settings_json: unknown;
};

const sanitizeDefaultModelConfigs = (modelConfigs: Record<string, ModelConfig>) =>
  Object.fromEntries(
    Object.entries(modelConfigs).map(([configId, config]) => [
      configId,
      {
        ...config,
        apiKey: "",
      },
    ]),
  );

const getDefaultSettings = (): UserModelConfigSettings => {
  const defaultConfigs = getGlobalState("modelConfigs") || {};
  return {
    modelConfigs: sanitizeDefaultModelConfigs(defaultConfigs),
    defaultModel: null,
  };
};

const readUserModelConfigSettings = async (
  userId: string,
): Promise<UserModelConfigSettings | null> => {
  await ensureMysqlSchemaUpToDate();
  const rows = await mysqlQuery<UserModelConfigRow>(
    "SELECT settings_json FROM user_model_configs WHERE user_id = ? LIMIT 1",
    [userId],
  );
  const rawSettings = rows[0]?.settings_json;
  if (!rawSettings) {
    return null;
  }

  const parsed = UserModelConfigSettingsSchema.safeParse(parseJsonColumn(rawSettings, {}));
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

export const getUserModelConfigsController = async (userId: string) => {
  try {
    const userSettings = await readUserModelConfigSettings(userId);
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
      UserModelConfigSettingsSchema,
      "INVALID_MODEL_CONFIGS_REQUEST",
    );
    await ensureMysqlSchemaUpToDate();
    await mysqlExecute(
      `
        INSERT INTO user_model_configs (user_id, settings_json, created_at, updated_at)
        VALUES (?, CAST(? AS JSON), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE
          settings_json = VALUES(settings_json),
          updated_at = CURRENT_TIMESTAMP(3)
      `,
      [userId, JSON.stringify(settings)],
    );
    return jsonResponse({
      hasUserConfig: true,
      ...settings,
    });
  } catch (error) {
    return errorResponse(error, {
      status: 400,
      code: "UPSERT_MODEL_CONFIGS_FAILED",
      logLabel: "[AmigoHttp] 保存模型配置失败",
    });
  }
};
