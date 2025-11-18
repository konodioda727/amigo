import type { MessageResolvers } from "../types";

export const handleAckMessage: MessageResolvers<"ack"> = ({
  newMessage,
  currentMessagesRef,
  setMessages,
}) => {
  const lastMessage = currentMessagesRef.current.at(-1);
  const targetMessage = newMessage.data.targetMessage
  // 如果存在多个连接，消息可能是从其余客户端发出的，此时需要验证 ack 消息是否对应本会话中的消息，如果不是则需要同步过来
  if (lastMessage?.data.updateTime !== targetMessage?.data.updateTime) {
    currentMessagesRef.current.push(newMessage.data.targetMessage);
    setMessages([...currentMessagesRef.current]);
    return;
  }
  // 更新最后一条消息的状态为 acked
  if (lastMessage && "status" in lastMessage.data) {
    currentMessagesRef.current.at(-1)!.data.status = newMessage.data.status;
    currentMessagesRef.current.at(-1)!.data.updateTime = newMessage.data.updateTime;
    setMessages([...currentMessagesRef.current]);
  }
};
