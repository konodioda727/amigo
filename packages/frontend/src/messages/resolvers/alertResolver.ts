import type { MessageResolvers } from "../types";

export const handleAlertMessage: MessageResolvers<"alert"> = ({
  newMessage,
  currentMessagesRef,
  setMessages,
}) => {
  currentMessagesRef.current.push(newMessage);
  setMessages([...currentMessagesRef.current]);
};
