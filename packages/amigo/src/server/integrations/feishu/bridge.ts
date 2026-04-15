import {
  conversationOrchestrator,
  conversationRepository,
  getGlobalState,
  logger,
} from "@amigo-llm/backend";
import type { ConversationMessageHookPayload, CreateTaskConfig } from "@amigo-llm/backend/sdk";
import * as Lark from "@larksuiteoapi/node-sdk";
import {
  findFeishuChannelOwnerUserId,
  findOrCreateExternalIdentityUser,
  findPreferredLocalWebUser,
  getFeishuAppCredentials,
  upsertNotificationChannel,
} from "../../db";
import type { ConversationChannelProvider } from "../channels/router";
import { FeishuDeliveryStore } from "./deliveryStore";
import { FeishuSessionStore } from "./sessionStore";

const DEFAULT_HISTORY_LIMIT = 20;
const DELIVERY_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const READY_STATUSES = new Set([
  "completed",
  "aborted",
  "idle",
  "error",
  "waiting_tool_confirmation",
]);

interface FeishuBridgeOptions {
  cachePath: string;
  resolveTaskConfig?: (
    context: unknown,
  ) => Promise<undefined | CreateTaskConfig> | undefined | CreateTaskConfig;
}

interface FeishuAuthState {
  accessToken: string;
  expiresAt: number;
}

interface FeishuTaskContext {
  trigger: "feishu";
  userId?: string;
  feishu: {
    tenantKey?: string;
    chatId: string;
    threadId?: string;
    chatType: string;
    sessionKey: string;
    lastIncomingMessageId: string;
    lastIncomingMessageType: string;
    lastIncomingUserId?: string;
    historyLimit: number;
  };
}

interface FeishuReceiveEvent {
  sender: {
    sender_id?: {
      union_id?: string;
      user_id?: string;
      open_id?: string;
    };
    sender_type: string;
    tenant_key?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    create_time: string;
    update_time?: string;
    chat_id: string;
    thread_id?: string;
    chat_type: string;
    message_type: string;
    content: string;
    mentions?: Array<{
      key: string;
      id: {
        union_id?: string;
        user_id?: string;
        open_id?: string;
      };
      name: string;
      tenant_key?: string;
    }>;
    user_agent?: string;
  };
}

interface FeishuListMessagesResponse {
  code: number;
  msg: string;
  data?: {
    items?: Array<{
      message_id: string;
      root_id?: string;
      parent_id?: string;
      thread_id?: string;
      msg_type: string;
      create_time: string;
      update_time?: string;
      chat_id: string;
      deleted?: boolean;
      sender?: {
        id?: string;
        id_type?: string;
        sender_type?: string;
        tenant_key?: string;
      };
      body?: {
        content?: string;
      };
    }>;
  };
}

type FeishuHistoryItem = NonNullable<
  NonNullable<FeishuListMessagesResponse["data"]>["items"]
>[number];

interface FeishuApiResponse {
  code: number;
  msg: string;
}

interface FeishuCardPayload {
  config?: {
    wide_screen_mode?: boolean;
    enable_forward?: boolean;
  };
  header: {
    template?: string;
    title: {
      tag: "plain_text";
      content: string;
    };
  };
  elements: Array<Record<string, unknown>>;
}

interface ToolTransportPayload {
  toolName?: unknown;
  result?: unknown;
  error?: unknown;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isGroupChat = (event: FeishuReceiveEvent) => event.message.chat_type === "group";

const makeSessionKey = (event: FeishuReceiveEvent) => {
  const tenantKey = event.sender.tenant_key || "unknown";
  if (isGroupChat(event)) {
    const threadKey = event.message.thread_id?.trim() || "root";
    return `${tenantKey}:group:${event.message.chat_id}:${threadKey}:${event.message.message_id}`;
  }
  return `${tenantKey}:p2p:${event.message.chat_id}`;
};

const extractSenderId = (event: FeishuReceiveEvent) =>
  event.sender.sender_id?.open_id ||
  event.sender.sender_id?.user_id ||
  event.sender.sender_id?.union_id ||
  "";

const maskIdentifier = (value?: string): string => {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "missing";
  }
  if (trimmed.length <= 8) {
    return trimmed;
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
};

const describeSenderIds = (event: FeishuReceiveEvent): string =>
  `open_id=${maskIdentifier(event.sender.sender_id?.open_id)} ` +
  `user_id=${maskIdentifier(event.sender.sender_id?.user_id)} ` +
  `union_id=${maskIdentifier(event.sender.sender_id?.union_id)}`;

const buildFeishuContext = (event: FeishuReceiveEvent, userId?: string): FeishuTaskContext => ({
  trigger: "feishu",
  ...(userId ? { userId } : {}),
  feishu: {
    tenantKey: event.sender.tenant_key,
    chatId: event.message.chat_id,
    threadId: event.message.thread_id,
    chatType: event.message.chat_type,
    sessionKey: makeSessionKey(event),
    lastIncomingMessageId: event.message.message_id,
    lastIncomingMessageType: event.message.message_type,
    lastIncomingUserId: extractSenderId(event) || undefined,
    historyLimit: DEFAULT_HISTORY_LIMIT,
  },
});

const mergeTaskContext = (current: unknown, next: FeishuTaskContext): unknown => {
  if (!isPlainObject(current)) {
    return next;
  }
  return {
    ...current,
    ...(next.userId ? { userId: next.userId } : {}),
    trigger: next.trigger,
    feishu: {
      ...(isPlainObject(current.feishu) ? current.feishu : {}),
      ...next.feishu,
    },
  };
};

export class FeishuBridge implements ConversationChannelProvider {
  readonly name = "feishu";
  private readonly ackReactionType =
    (process.env.FEISHU_ACK_REACTION_TYPE || "OK").trim().toUpperCase() || "OK";
  private readonly requireGroupMention =
    (process.env.FEISHU_GROUP_MODE || "").trim().toLowerCase() !== "all";
  private readonly deliveryStore: FeishuDeliveryStore;
  private readonly sessionStore: FeishuSessionStore;
  private wsClient: Lark.WSClient | null = null;
  private readonly processedInbound = new Map<string, number>();
  private readonly processedOutbound = new Map<string, number>();
  private credentials: { appId: string; appSecret: string } | null = null;
  private authState: FeishuAuthState | null = null;
  private started = false;
  private wsStarted = false;

  constructor(private readonly options: FeishuBridgeOptions) {
    this.deliveryStore = new FeishuDeliveryStore(options.cachePath);
    this.sessionStore = new FeishuSessionStore(options.cachePath);
  }

  isEnabled(): boolean {
    return !!this.credentials?.appId && !!this.credentials?.appSecret;
  }

  async init(): Promise<void> {
    await Promise.all([this.deliveryStore.init(), this.sessionStore.init()]);
    await this.reloadCredentials();
  }

  start(): void {
    this.started = true;
    void this.reloadCredentials();
  }

  async reloadCredentials(): Promise<void> {
    const previousCredentials = this.credentials;
    this.credentials = await getFeishuAppCredentials();
    this.authState = null;

    if (!this.credentials) {
      this.wsClient = null;
      this.wsStarted = false;
      if (this.started) {
        logger.info("[FeishuBridge] 未配置飞书 AK/SK，跳过飞书集成");
      }
      return;
    }

    if (!this.wsClient) {
      this.wsClient = new Lark.WSClient({
        appId: this.credentials.appId,
        appSecret: this.credentials.appSecret,
        loggerLevel: Lark.LoggerLevel.info,
      });
    } else if (
      previousCredentials &&
      (previousCredentials.appId !== this.credentials.appId ||
        previousCredentials.appSecret !== this.credentials.appSecret)
    ) {
      logger.info("[FeishuBridge] 飞书凭证已更新，重启服务后长连接会使用新配置");
    }

    if (!this.started || this.wsStarted || !this.wsClient) {
      return;
    }

    try {
      await this.wsClient.start({
        eventDispatcher: new Lark.EventDispatcher({}).register({
          "im.message.receive_v1": async (data: FeishuReceiveEvent) => {
            await this.handleIncomingEvent(data);
          },
        }),
      });
      this.wsStarted = true;
      logger.info("[FeishuBridge] 飞书长连接已启动");
    } catch (error) {
      logger.error(
        `[FeishuBridge] 飞书长连接启动失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  supportsContext(context: unknown): boolean {
    return !!this.extractFeishuContext(context);
  }

  async deliverConversationMessage(payload: ConversationMessageHookPayload): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    if (payload.message.partial) {
      return;
    }

    const feishuContext = this.extractFeishuContext(payload.context);
    if (!feishuContext) {
      return;
    }

    if (!this.shouldForwardOutboundMessage(payload.taskId, payload.message)) {
      return;
    }

    const outboundText = this.buildOutboundText(payload.message);
    if (!outboundText) {
      return;
    }

    const outboundKey = `${payload.taskId}:${payload.message.type}:${payload.message.updateTime || 0}`;
    this.deliveryStore.cleanup(DELIVERY_RECORD_TTL_MS);
    if (this.deliveryStore.has(outboundKey)) {
      return;
    }
    this.cleanupProcessed(this.processedOutbound, 60 * 60 * 1000);
    if (this.processedOutbound.has(outboundKey)) {
      return;
    }
    this.processedOutbound.set(outboundKey, Date.now());

    try {
      if (this.isAutomationContext(payload.context)) {
        await this.sendAutomationMessage(feishuContext.chatId, payload.context, outboundText);
      } else if (this.shouldSendDirectlyToChat(payload.context)) {
        await this.sendText(feishuContext.chatId, outboundText);
      } else {
        await this.replyOrSendText(feishuContext, outboundText);
      }
      this.deliveryStore.set(outboundKey);
    } catch (error) {
      logger.error(
        `[FeishuBridge] 推送 assistant 消息到飞书失败 taskId=${payload.taskId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async handleIncomingEvent(event: FeishuReceiveEvent): Promise<void> {
    if (event.sender.sender_type !== "user") {
      return;
    }
    if (event.message.chat_type === "group" && this.requireGroupMention) {
      if (!event.message.mentions || event.message.mentions.length === 0) {
        return;
      }
    }

    this.cleanupProcessed(this.processedInbound, 30 * 60 * 1000);
    if (this.processedInbound.has(event.message.message_id)) {
      return;
    }
    this.processedInbound.set(event.message.message_id, Date.now());

    const userId = await this.resolveOrCreateUser(event);
    const feishuContext = buildFeishuContext(event, userId || undefined);
    if (!userId) {
      logger.warn(
        `[FeishuBridge] 飞书消息未绑定本地用户 messageId=${event.message.message_id} chatId=${event.message.chat_id} chatType=${event.message.chat_type} ${describeSenderIds(event)}`,
      );
    } else {
      logger.info(
        `[FeishuBridge] 飞书消息已绑定本地用户 messageId=${event.message.message_id} externalUser=${maskIdentifier(extractSenderId(event))} userId=${maskIdentifier(userId)}`,
      );
    }
    if (userId) {
      try {
        await upsertNotificationChannel({
          userId,
          type: "feishu",
          name: `feishu:${event.message.chat_id}`,
          config: feishuContext.feishu,
          isDefault: true,
          enabled: true,
        });
      } catch (error) {
        logger.warn(
          `[FeishuBridge] 更新飞书通知通道失败 userId=${maskIdentifier(userId)} chatId=${event.message.chat_id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    await this.acknowledgeInboundMessage(feishuContext.feishu);
    const shouldReuseConversation = !isGroupChat(event);
    const sessionKey = feishuContext.feishu.sessionKey;
    const reusableTaskId = shouldReuseConversation ? this.sessionStore.get(sessionKey) : null;
    let conversation = this.loadConversation(reusableTaskId);
    const isNewConversation = !conversation;

    const resolvedTaskConfig = isNewConversation
      ? await this.resolveTaskConfig(feishuContext).catch((error) => {
          logger.error(
            `[FeishuBridge] 解析飞书任务配置失败: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return undefined;
        })
      : undefined;

    const initialConversationContext = mergeTaskContext(resolvedTaskConfig?.context, feishuContext);

    if (!conversation) {
      conversation = conversationRepository.create({
        customPrompt: resolvedTaskConfig?.customPrompt,
        context: initialConversationContext,
      });
      if (shouldReuseConversation) {
        this.sessionStore.set(sessionKey, conversation.id, userId || undefined);
      }
    }

    if (!isNewConversation) {
      conversation.memory.setContext(mergeTaskContext(conversation.memory.context, feishuContext));
    }

    if (isNewConversation) {
      const onConversationCreate = getGlobalState("onConversationCreate");
      if (onConversationCreate) {
        await onConversationCreate({
          taskId: conversation.id,
          context: conversation.memory.context,
        });
      }
    }

    if (!READY_STATUSES.has(conversation.status)) {
      await this.replyOrSendText(
        feishuContext.feishu,
        "我还在处理上一条请求，等当前任务结束后再 @我一次。",
      );
      return;
    }

    const amigoInput = isGroupChat(event)
      ? await this.buildGroupAmigoInput(event)
      : this.buildDirectMessageInput(event);
    await conversationOrchestrator.setUserInput(conversation, amigoInput);
    const executor = conversationOrchestrator.getExecutor(conversation.id);
    void executor.execute(conversation);
  }

  private loadConversation(taskId: string | null) {
    if (!taskId) {
      return null;
    }
    return conversationRepository.get(taskId) || conversationRepository.load(taskId) || null;
  }

  private async resolveTaskConfig(context: unknown) {
    if (!this.options.resolveTaskConfig) {
      return undefined;
    }
    return this.options.resolveTaskConfig(context);
  }

  private async resolveOrCreateUser(event: FeishuReceiveEvent): Promise<string | null> {
    const senderExternalId = extractSenderId(event);
    const matchedChannelOwnerUserId = await findFeishuChannelOwnerUserId({
      chatId: event.message.chat_id,
      tenantKey: event.sender.tenant_key,
    }).catch((error) => {
      logger.warn(
        `[FeishuBridge] 通过通道匹配 Web 用户失败 messageId=${event.message.message_id} chatId=${event.message.chat_id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    });
    if (matchedChannelOwnerUserId) {
      return matchedChannelOwnerUserId;
    }

    const preferredLocalWebUser = await findPreferredLocalWebUser().catch((error) => {
      logger.warn(
        `[FeishuBridge] 查询首选 Web 用户失败 messageId=${event.message.message_id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    });
    if (preferredLocalWebUser?.id) {
      return preferredLocalWebUser.id;
    }

    if (!senderExternalId) {
      logger.warn(
        `[FeishuBridge] 飞书事件缺少 sender id，无法绑定本地用户 messageId=${event.message.message_id} chatId=${event.message.chat_id} ${describeSenderIds(event)}`,
      );
      return null;
    }

    try {
      const user = await findOrCreateExternalIdentityUser({
        provider: "feishu",
        externalId: senderExternalId,
      });
      return user?.id || null;
    } catch (error) {
      logger.warn(
        `[FeishuBridge] 解析飞书用户失败 sender=${maskIdentifier(senderExternalId)} messageId=${event.message.message_id} chatId=${event.message.chat_id} ${describeSenderIds(event)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private extractFeishuContext(context: unknown): FeishuTaskContext["feishu"] | null {
    if (!isPlainObject(context) || !isPlainObject(context.feishu)) {
      return null;
    }
    const { chatId, chatType } = context.feishu;
    if (typeof chatId !== "string" || typeof chatType !== "string") {
      return null;
    }

    return {
      tenantKey:
        typeof context.feishu.tenantKey === "string" ? context.feishu.tenantKey : undefined,
      chatId,
      threadId: typeof context.feishu.threadId === "string" ? context.feishu.threadId : undefined,
      chatType,
      sessionKey:
        typeof context.feishu.sessionKey === "string"
          ? context.feishu.sessionKey
          : `feishu:${chatId}`,
      lastIncomingMessageId:
        typeof context.feishu.lastIncomingMessageId === "string"
          ? context.feishu.lastIncomingMessageId
          : "",
      lastIncomingMessageType:
        typeof context.feishu.lastIncomingMessageType === "string"
          ? context.feishu.lastIncomingMessageType
          : "text",
      lastIncomingUserId:
        typeof context.feishu.lastIncomingUserId === "string"
          ? context.feishu.lastIncomingUserId
          : undefined,
      historyLimit:
        typeof context.feishu.historyLimit === "number"
          ? context.feishu.historyLimit
          : DEFAULT_HISTORY_LIMIT,
    };
  }

  private shouldSendDirectlyToChat(context: unknown): boolean {
    return isPlainObject(context) && context.trigger === "automation";
  }

  private isAutomationContext(
    context: unknown,
  ): context is { trigger: "automation"; automationName?: unknown } {
    return isPlainObject(context) && context.trigger === "automation";
  }

  private buildOutboundText(message: ConversationMessageHookPayload["message"]): string | null {
    if (message.role !== "assistant") {
      return null;
    }

    if (message.type === "message") {
      const text = message.content.trim();
      return text || null;
    }

    if (message.type === "askFollowupQuestion") {
      return this.formatFollowupQuestionMessage(message.content);
    }

    if (message.type === "tool") {
      return this.formatIdleToolMessage(message.content);
    }

    return null;
  }

  private shouldForwardOutboundMessage(
    taskId: string,
    message: ConversationMessageHookPayload["message"],
  ): boolean {
    if (message.role !== "assistant" || message.partial) {
      return false;
    }

    if (message.type === "message") {
      return true;
    }

    if (message.type === "askFollowupQuestion") {
      const conversation =
        conversationRepository.get(taskId) || conversationRepository.load(taskId);
      const tool = conversation?.toolService.getToolFromName("askFollowupQuestion");
      return tool?.completionBehavior === "idle";
    }

    if (message.type !== "tool") {
      return false;
    }

    const payload = this.parseToolTransportPayload(message.content);
    if (!payload || typeof payload.toolName !== "string" || !payload.toolName.trim()) {
      return false;
    }

    const conversation = conversationRepository.get(taskId) || conversationRepository.load(taskId);
    const toolName = payload.toolName.trim();
    const tool = conversation?.toolService.getToolFromName(toolName);
    return toolName === "completeTask" || tool?.completionBehavior === "idle";
  }

  private parseToolTransportPayload(content: string): ToolTransportPayload | null {
    try {
      const parsed = JSON.parse(content) as ToolTransportPayload;
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private formatIdleToolMessage(content: string): string | null {
    const payload = this.parseToolTransportPayload(content);
    if (!payload || typeof payload.toolName !== "string") {
      return null;
    }

    const result = payload.result;
    if (typeof result === "string") {
      const text = result.trim();
      return text || null;
    }

    if (isPlainObject(result) && typeof result.message === "string") {
      const text = result.message.trim();
      return text || null;
    }

    return null;
  }

  private formatFollowupQuestionMessage(content: string): string | null {
    try {
      const parsed = JSON.parse(content) as {
        params?: {
          question?: unknown;
          suggestOptions?: unknown;
        };
      };
      const question =
        parsed?.params && typeof parsed.params.question === "string"
          ? parsed.params.question.trim()
          : "";
      const suggestOptions = Array.isArray(parsed?.params?.suggestOptions)
        ? parsed.params.suggestOptions.filter((item): item is string => typeof item === "string")
        : [];

      if (!question) {
        return null;
      }

      const lines = ["我需要你补充一个信息：", question.trim()];
      if (suggestOptions.length > 0) {
        lines.push("", "可直接回复以下任一选项：");
        for (const [index, option] of suggestOptions.entries()) {
          lines.push(`${index + 1}. ${option}`);
        }
      }
      return lines.join("\n");
    } catch {
      return null;
    }
  }

  private buildDirectMessageInput(event: FeishuReceiveEvent): string {
    const currentText = this.extractMessageText(event.message.message_type, event.message.content);
    return currentText || `[${event.message.message_type}]`;
  }

  private async buildGroupAmigoInput(event: FeishuReceiveEvent): Promise<string> {
    const historyMessages = await this.listRecentMessages(event).catch((error) => {
      logger.warn(
        `[FeishuBridge] 拉取飞书群聊历史失败，降级为仅处理当前消息: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    });
    const currentText = this.extractMessageText(event.message.message_type, event.message.content);
    const historyLines = historyMessages
      .map((message) => this.formatHistoryLine(message))
      .filter(Boolean);

    const pieces = [
      "你正在处理一条来自飞书群聊的请求。",
      `最近 ${DEFAULT_HISTORY_LIMIT} 条飞书会话消息（按时间升序）：`,
      historyLines.length > 0 ? historyLines.join("\n") : "(未能获取到历史消息)",
      "",
      "当前用户触发消息：",
      currentText || `[${event.message.message_type}]`,
      "",
      "请直接给出最终回复内容；如果信息不足，就直接向用户追问。",
    ];

    return pieces.join("\n");
  }

  private formatHistoryLine(message: FeishuHistoryItem) {
    const text = this.extractMessageText(message.msg_type, message.body?.content || "");
    if (!text) {
      return "";
    }
    const sender =
      message.sender?.sender_type === "app" ? "bot" : this.formatUserLabel(message.sender?.id);
    return `- ${this.formatTimestamp(message.create_time)} ${sender}: ${text}`;
  }

  private formatUserLabel(senderId: string | undefined) {
    if (!senderId) {
      return "user";
    }
    return `user:${senderId.slice(-6)}`;
  }

  private formatTimestamp(timestampMs: string) {
    const numeric = Number(timestampMs);
    if (!Number.isFinite(numeric)) {
      return "--:--";
    }
    const date = new Date(numeric);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  private extractMessageText(messageType: string, content: string): string {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      switch (messageType) {
        case "text":
          return this.sanitizeText(String(parsed.text || ""));
        case "post":
          return this.flattenPostContent(parsed);
        case "file":
          return `[文件] ${String(parsed.file_name || "未命名文件")}`;
        case "image":
          return "[图片]";
        case "media":
          return "[视频]";
        case "audio":
          return "[语音]";
        case "sticker":
          return "[表情包]";
        default:
          return `[${messageType}]`;
      }
    } catch {
      return content.trim();
    }
  }

  private flattenPostContent(parsed: Record<string, unknown>): string {
    const content = parsed.content;
    if (!Array.isArray(content)) {
      return "[富文本]";
    }

    const lines: string[] = [];
    for (const row of content) {
      if (!Array.isArray(row)) {
        continue;
      }
      const texts = row
        .map((item) => {
          if (!isPlainObject(item) || typeof item.tag !== "string") {
            return "";
          }
          if (item.tag === "text" || item.tag === "a" || item.tag === "code_block") {
            return typeof item.text === "string" ? item.text : "";
          }
          if (item.tag === "at") {
            return typeof item.user_name === "string" && item.user_name.trim()
              ? `@${item.user_name.trim()}`
              : "@某人";
          }
          if (item.tag === "img") {
            return "[图片]";
          }
          if (item.tag === "media") {
            return "[视频]";
          }
          if (item.tag === "emotion") {
            return "[表情]";
          }
          if (item.tag === "hr") {
            return "---";
          }
          return "";
        })
        .filter(Boolean)
        .join("");
      if (texts) {
        lines.push(texts);
      }
    }

    return this.sanitizeText(lines.join("\n"));
  }

  private sanitizeText(text: string): string {
    return text.replace(/@_user_\d+\s*/g, "").trim();
  }

  private async listRecentMessages(event: FeishuReceiveEvent) {
    const historyParams = new URLSearchParams({
      container_id_type: event.message.thread_id ? "thread" : "chat",
      container_id: event.message.thread_id || event.message.chat_id,
      sort_type: "ByCreateTimeDesc",
      page_size: String(DEFAULT_HISTORY_LIMIT),
    });
    const createTimeSeconds = Math.floor(Number(event.message.create_time) / 1000);
    if (Number.isFinite(createTimeSeconds) && createTimeSeconds > 0 && !event.message.thread_id) {
      historyParams.set("end_time", String(createTimeSeconds));
    }

    const result = await this.requestFeishu<FeishuListMessagesResponse>(
      `/open-apis/im/v1/messages?${historyParams.toString()}`,
      { method: "GET" },
    );

    return ((result.data?.items || []) as FeishuHistoryItem[])
      .filter((message) => message.message_id !== event.message.message_id)
      .slice()
      .reverse();
  }

  private async acknowledgeInboundMessage(context: FeishuTaskContext["feishu"]): Promise<void> {
    if (!this.ackReactionType) {
      return;
    }
    try {
      await this.addReaction(context.lastIncomingMessageId, this.ackReactionType);
    } catch (error) {
      logger.warn(
        `[FeishuBridge] 添加已收到 reaction 失败 chatId=${context.chatId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async addReaction(messageId: string, emojiType: string): Promise<void> {
    await this.requestFeishu<FeishuApiResponse>(
      `/open-apis/im/v1/messages/${messageId}/reactions`,
      {
        method: "POST",
        body: JSON.stringify({
          reaction_type: {
            emoji_type: emojiType,
          },
        }),
      },
    );
  }

  private async sendAutomationMessage(
    chatId: string,
    context: { trigger: "automation"; automationName?: unknown },
    text: string,
  ): Promise<void> {
    const title =
      typeof context.automationName === "string" && context.automationName.trim()
        ? context.automationName.trim()
        : "自动提醒";
    await this.sendCard(chatId, this.buildAutomationCard(title, text));
  }

  private buildAutomationCard(title: string, text: string): FeishuCardPayload {
    return {
      config: {
        wide_screen_mode: true,
        enable_forward: true,
      },
      header: {
        template: "blue",
        title: {
          tag: "plain_text",
          content: title,
        },
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: this.escapeLarkMarkdown(text),
          },
        },
        {
          tag: "note",
          elements: [
            {
              tag: "plain_text",
              content: `发送时间：${new Date().toLocaleString("zh-CN")}`,
            },
          ],
        },
      ],
    };
  }

  private escapeLarkMarkdown(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\n/g, "\n\n");
  }

  private async replyOrSendText(context: FeishuTaskContext["feishu"], text: string): Promise<void> {
    try {
      await this.replyText(context.lastIncomingMessageId, text, !!context.threadId);
      return;
    } catch (error) {
      logger.warn(
        `[FeishuBridge] 回复消息失败，将降级发送到 chat_id=${context.chatId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await this.sendText(context.chatId, text);
  }

  private async replyText(messageId: string, text: string, replyInThread: boolean): Promise<void> {
    await this.requestFeishu<FeishuApiResponse>(`/open-apis/im/v1/messages/${messageId}/reply`, {
      method: "POST",
      body: JSON.stringify({
        content: JSON.stringify({ text }),
        msg_type: "text",
        reply_in_thread: replyInThread,
        uuid: crypto.randomUUID(),
      }),
    });
  }

  private async sendText(chatId: string, text: string): Promise<void> {
    await this.requestFeishu<FeishuApiResponse>(
      "/open-apis/im/v1/messages?receive_id_type=chat_id",
      {
        method: "POST",
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text }),
          uuid: crypto.randomUUID(),
        }),
      },
    );
  }

  private async sendCard(chatId: string, card: FeishuCardPayload): Promise<void> {
    await this.requestFeishu<FeishuApiResponse>(
      "/open-apis/im/v1/messages?receive_id_type=chat_id",
      {
        method: "POST",
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: "interactive",
          content: JSON.stringify(card),
          uuid: crypto.randomUUID(),
        }),
      },
    );
  }

  private async requestFeishu<T>(pathname: string, init: RequestInit): Promise<T> {
    const token = await this.getTenantAccessToken();
    const response = await fetch(`https://open.feishu.cn${pathname}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
        ...(init.headers || {}),
      },
    });
    const result = (await response.json().catch(() => null)) as T | null;

    if (!response.ok || !result || (result as { code?: number }).code !== 0) {
      throw new Error(
        `feishu api failed: ${response.status} ${
          result && typeof result === "object" && "msg" in result
            ? String((result as { msg?: string }).msg || "unknown error")
            : "unknown error"
        }`,
      );
    }

    return result;
  }

  private async getTenantAccessToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error("飞书 AK/SK 未配置");
    }

    const now = Date.now();
    if (this.authState && this.authState.expiresAt - now > 5 * 60 * 1000) {
      return this.authState.accessToken;
    }

    const response = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          app_id: this.credentials.appId,
          app_secret: this.credentials.appSecret,
        }),
      },
    );
    const result = (await response.json()) as {
      code?: number;
      msg?: string;
      tenant_access_token?: string;
      expire?: number;
    };
    if (!response.ok || result.code !== 0 || !result.tenant_access_token) {
      throw new Error(`获取 tenant_access_token 失败: ${result.msg || response.statusText}`);
    }

    this.authState = {
      accessToken: result.tenant_access_token,
      expiresAt: now + (result.expire || 7200) * 1000,
    };
    return this.authState.accessToken;
  }

  private cleanupProcessed(target: Map<string, number>, ttlMs: number): void {
    const now = Date.now();
    for (const [key, createdAt] of target.entries()) {
      if (now - createdAt > ttlMs) {
        target.delete(key);
      }
    }
  }
}

export const createFeishuBridge = (options: FeishuBridgeOptions) => new FeishuBridge(options);
