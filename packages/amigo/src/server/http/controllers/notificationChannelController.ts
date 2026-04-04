import { z } from "zod";
import { listNotificationChannels, updateNotificationChannels } from "../../db";
import { parseJsonBody } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

const NotificationChannelUpdateSchema = z.object({
  id: z.string().trim().min(1),
  enabled: z.boolean(),
  isDefault: z.boolean(),
});

const UpsertNotificationChannelsRequestSchema = z.object({
  channels: z.array(NotificationChannelUpdateSchema),
});

export const listNotificationChannelsController = async (userId: string) => {
  try {
    const channels = await listNotificationChannels(userId);
    return jsonResponse({
      channels,
      supportedTypes: ["feishu"],
    });
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "LIST_NOTIFICATION_CHANNELS_FAILED",
      logLabel: "[AmigoHttp] 获取消息通道失败",
    });
  }
};

export const upsertNotificationChannelsController = async (req: Request, userId: string) => {
  try {
    const body = await parseJsonBody(
      req,
      UpsertNotificationChannelsRequestSchema,
      "INVALID_NOTIFICATION_CHANNELS_REQUEST",
    );
    const channels = await updateNotificationChannels(userId, body.channels);
    return jsonResponse({
      channels,
      supportedTypes: ["feishu"],
    });
  } catch (error) {
    return errorResponse(error, {
      status: 400,
      code: "UPSERT_NOTIFICATION_CHANNELS_FAILED",
      logLabel: "[AmigoHttp] 保存消息通道失败",
    });
  }
};
