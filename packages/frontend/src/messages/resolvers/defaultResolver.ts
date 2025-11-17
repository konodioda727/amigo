import { MessageResolvers } from "../types";

export const defaultResolver: MessageResolvers<any> = ({newMessage, currentMessagesRef, setMessages}) => {
    const isUpdatingPrevMessage =
      newMessage.data.updateTime === currentMessagesRef.current.at(-1)?.data.updateTime;

    if (isUpdatingPrevMessage) {
      currentMessagesRef.current = [...currentMessagesRef.current.slice(0, -1), newMessage];
    } else {
      currentMessagesRef.current = [...currentMessagesRef.current, newMessage];
    }
    setMessages(currentMessagesRef.current);
}