import type { USER_SEND_MESSAGE_NAME } from "@amigo/types";
import type { ConversationManager } from "@/core/conversationManager";
import type BaseMessageResolver from "./base";
import { CommonMessageResolver } from "./commonMessageResolver";
import { InterruptMessageResolver } from "./interruptMessageResolver";
import { LoadTaskMessageResolver } from "./loadTaskMessageResolver";
import { LoadSubTaskMessageResolver } from "./loadSubTaskMessageResolver";
import { ResumeMessageResolver } from "./resumeMessageResolver";
import { CallSubTaskMessageResolver } from "./callSubTaskMessageResolver";

/**
 * 不同 message 处理器
 */
const resolvers = [CommonMessageResolver, InterruptMessageResolver, LoadTaskMessageResolver, LoadSubTaskMessageResolver, ResumeMessageResolver, CallSubTaskMessageResolver];

const defaultResolver = CommonMessageResolver;

/**
 * 获取对应 message 处理器
 * @param type 消息类型
 */
export const getResolver = <K extends USER_SEND_MESSAGE_NAME>(
  type: K,
  manager: ConversationManager,
): BaseMessageResolver<K> => {
  const resolver = resolvers.find((res) => res.resolverName === type) || defaultResolver;
  return new resolver(manager);
};
