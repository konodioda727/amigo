import { z } from "zod";
import { getFeishuAppCredentialSummary, upsertFeishuAppCredentials } from "../../db";
import type { FeishuBridge } from "../../integrations/feishu/bridge";
import { parseJsonBody } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

const UpsertFeishuCredentialsRequestSchema = z.object({
  appId: z.string().trim().optional(),
  appSecret: z.string().trim().optional(),
});

const buildFeishuIntegrationResponse = async () => {
  const credentialSummary = await getFeishuAppCredentialSummary();

  return {
    provider: "feishu",
    ...credentialSummary,
  };
};

export const getFeishuIntegrationController = async () => {
  try {
    return jsonResponse(await buildFeishuIntegrationResponse());
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "GET_FEISHU_INTEGRATION_FAILED",
      logLabel: "[AmigoHttp] 获取飞书集成配置失败",
    });
  }
};

export const upsertFeishuIntegrationController = async (
  req: Request,
  feishuBridge: FeishuBridge,
) => {
  try {
    const body = await parseJsonBody(
      req,
      UpsertFeishuCredentialsRequestSchema,
      "INVALID_FEISHU_INTEGRATION_REQUEST",
    );
    await upsertFeishuAppCredentials({
      appId: body.appId,
      appSecret: body.appSecret,
    });
    await feishuBridge.reloadCredentials();
    return jsonResponse(await buildFeishuIntegrationResponse());
  } catch (error) {
    return errorResponse(error, {
      status: 400,
      code: "UPSERT_FEISHU_INTEGRATION_FAILED",
      logLabel: "[AmigoHttp] 保存飞书集成配置失败",
    });
  }
};
