import { getGlobalState, setGlobalState } from "@/globalState";
import { fileConversationPersistenceProvider } from "./fileConversationPersistenceProvider";
import type { ConversationPersistenceProvider } from "./types";

export type { ConversationPersistenceProvider } from "./types";

export { fileConversationPersistenceProvider };

export const getConversationPersistenceProvider = (): ConversationPersistenceProvider => {
  return getGlobalState("conversationPersistenceProvider") || fileConversationPersistenceProvider;
};

export const setConversationPersistenceProvider = (
  provider?: ConversationPersistenceProvider,
): void => {
  setGlobalState("conversationPersistenceProvider", provider);
};
