import { MessageResolvers } from "../types";

// subTaskHistory 消息不应该更新全局状态
// 它只会被 SubTaskRenderer 的订阅者处理
export const handleSubTaskHistoryMessageResolver: MessageResolvers<'subTaskHistory'> = ({newMessage, currentMessagesRef, setMessages}) => {
    // 不做任何处理，让订阅者自己处理
    // 这样可以避免影响全局消息列表
}
