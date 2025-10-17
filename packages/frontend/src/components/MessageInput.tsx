import React, { useState } from "react";
import { FaPaperPlane, FaStop, FaPlay } from "react-icons/fa";
import { useWebSocket } from "./WebSocketProvider";
import { v4 as uuidv4 } from "uuid";


const MessageInput = () => {
  const { sendMessage, displayMessages, taskId, setTaskId } = useWebSocket();
  const [inputContent, setInputContent] = useState<string>("");

  const lastMessage = displayMessages[displayMessages.length - 1];

  // 判断是否为“流式”状态（message/think 类型且有 partial 字段，或最后一条为用户消息）
  const isPartial =
    (lastMessage &&
      ("message" in lastMessage || "think" in lastMessage) &&
      (lastMessage as any).partial) ||
    (lastMessage && "status" in lastMessage && (lastMessage as any).status === "pending");

  // 判断是否为 interrupt 类型
  const isInterrupt =
    lastMessage && "error" in lastMessage && (lastMessage as any).error === "interrupt";

  const getButtonContent = () => {
    if (isInterrupt) {
      return <FaPlay className="w-4 h-4" />;
    }
    if (isPartial) {
      return <FaStop className="w-4 h-4" />;
    }
    return <FaPaperPlane className="w-4 h-4" />;
  };

  const handleSendMessage = () => {
    let currentTaskId = taskId;
    if (!currentTaskId) {
      currentTaskId = uuidv4();
      setTaskId(currentTaskId)
    }
    // 如果是用户输入模型尚未返回或者模型正在输出, 则此时按钮起到暂停作用
    if(isPartial) {
      sendMessage({type: 'interrupt', data: {taskId: currentTaskId}})
      return;
    }
    if (!inputContent.trim()) {
      alert("请输入消息内容");
      return;
    }
    sendMessage({
      data: { message: inputContent, taskId: currentTaskId, updateTime: Date.now().valueOf()},
      type: "userSendMessage",
    });
    setInputContent("");
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex gap-2 mb-4">
      <textarea
        className="textarea textarea-bordered flex-grow"
        placeholder="输入消息..."
        value={inputContent}
        onChange={(e) => setInputContent(e.target.value)}
        onKeyPress={handleKeyPress}
      ></textarea>
      <button
        onClick={handleSendMessage}
        className="btn btn-primary btn-square"
        type="button"
      >
        {getButtonContent()}
      </button>
    </div>
  );
};

export default MessageInput;
