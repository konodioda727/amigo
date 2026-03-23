import type { ConversationMessageHookPayload } from "@amigo-llm/backend/sdk";

export interface ConversationChannelProvider {
  readonly name: string;
  supportsContext(context: unknown): boolean;
  deliverConversationMessage(payload: ConversationMessageHookPayload): Promise<void>;
}

export class ConversationChannelRouter {
  constructor(private readonly providers: ConversationChannelProvider[]) {}

  async dispatchConversationMessage(payload: ConversationMessageHookPayload): Promise<void> {
    for (const provider of this.providers) {
      if (!provider.supportsContext(payload.context)) {
        continue;
      }
      await provider.deliverConversationMessage(payload);
    }
  }
}
