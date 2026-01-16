import type { USER_SEND_MESSAGE_NAME } from "@amigo-llm/types";
import type { Conversation } from "@/core/conversation";
import type BaseMessageResolver from "./base";
import { CommonMessageResolver } from "./commonMessageResolver";
import { InterruptMessageResolver } from "./interruptMessageResolver";
import { LoadTaskMessageResolver } from "./loadTaskMessageResolver";
import { ResumeMessageResolver } from "./resumeMessageResolver";

/**
 * 不同 message 处理器
 */
const resolvers = [
  CommonMessageResolver,
  InterruptMessageResolver,
  LoadTaskMessageResolver,
  ResumeMessageResolver,
];

const defaultResolver = CommonMessageResolver;

/**
 * 获取对应 message 处理器
 */
export const getResolver = <K extends USER_SEND_MESSAGE_NAME>(
  type: K,
  conversation: Conversation,
): BaseMessageResolver<K> => {
  const resolver = resolvers.find((res) => res.resolverName === type) || defaultResolver;
  return new resolver(conversation);
};
