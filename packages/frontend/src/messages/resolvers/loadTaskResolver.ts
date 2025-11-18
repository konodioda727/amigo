import { MessageResolvers } from "../types";

export const handleTaskHistoryMessageResolver: MessageResolvers<'taskHistory'> = ({newMessage, currentMessagesRef, setMessages}) => {
    const {messages} = newMessage.data
    
    currentMessagesRef.current = messages
    setMessages([...currentMessagesRef.current])
}