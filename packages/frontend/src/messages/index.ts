import type {
  WebSocketMessage,
  SERVER_SEND_MESSAGE_NAME,
  USER_SEND_MESSAGE_NAME,
} from "@amigo/types";
import { useCallback, useMemo, useRef, useState } from "react";
import { defaultResolver, handleAckMessage, handleAlertMessage, handleCommonMessage, handleTaskHistoryMessageResolver, handleSubTaskHistoryMessageResolver } from "./resolvers";
import type { MessageResolvers } from "./types";
import { combineMessages } from "./messageCombiner";

const resolvers: Partial<Record<SERVER_SEND_MESSAGE_NAME | 'default', MessageResolvers<any>>> = {
  ack: handleAckMessage,
  alert: handleAlertMessage,
  message: handleCommonMessage,
  taskHistory: handleTaskHistoryMessageResolver,
  subTaskHistory: handleSubTaskHistoryMessageResolver,
  default: defaultResolver
};

export const useMessages = () => {
  const [messages, setMessages] = useState<WebSocketMessage<any>[]>([]);
  const combinedMessages = useMemo(() => {    
    return combineMessages(messages)
  }, [messages])
  const currentMessagesRef = useRef<WebSocketMessage<any>[]>([]);
  const getResolver = <K extends SERVER_SEND_MESSAGE_NAME>(
    type: K,
  ): MessageResolvers<K> => {
    return resolvers[type] || resolvers["default"]!;
  };
  // 服务端输出处理
  const processReceivedMessage = useCallback((newMessage: WebSocketMessage<any>) => {
    const resolver = getResolver(newMessage.type as SERVER_SEND_MESSAGE_NAME);
    resolver({
      newMessage,
      currentMessagesRef,
      setMessages,
    });
  }, []);
  // 用户输入处理
  const updateMessage = useCallback(
    <T extends USER_SEND_MESSAGE_NAME>(newMessage: WebSocketMessage<T>) => {
      currentMessagesRef.current.push(newMessage);
      setMessages([...currentMessagesRef.current]);
    },
    [],
  );
  return {
    messages,
    processReceivedMessage,
    updateMessage,
    combinedMessages
  };
};
