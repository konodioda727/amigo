import { getGlobalState, setGlobalState } from "@/globalState";
import { fileConversationPersistenceProvider } from "./fileConversationPersistenceProvider";
import type { ConversationPersistenceProvider } from "./types";

export type { ConversationPersistenceProvider } from "./types";

export { fileConversationPersistenceProvider };

export const getConversationPersistenceProvider = (): ConversationPersistenceProvider => {
  const provider = getGlobalState("conversationPersistenceProvider");
  if (!provider) {
    throw new Error(
      "Conversation persistence provider is required. Configure a database-backed provider via the backend SDK before starting the server.",
    );
  }
  return provider;
};

export const setConversationPersistenceProvider = (
  provider?: ConversationPersistenceProvider,
): void => {
  setGlobalState("conversationPersistenceProvider", provider);
};
