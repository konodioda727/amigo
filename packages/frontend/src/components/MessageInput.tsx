import { useState, useEffect } from "react";
import { FaPaperPlane, FaStop, FaPlay } from "react-icons/fa";
import { useWebSocket } from "./WebSocketProvider";
import { v4 as uuidv4 } from "uuid";
import { toast } from "@/utils/toast";

type ButtonState = "send" | "stop" | "resume";

const MessageInput = () => {
  const { sendMessage, displayMessages, taskId } = useWebSocket();
  const [inputContent, setInputContent] = useState<string>("");
  const [buttonState, setButtonState] = useState<ButtonState>("send");

  const lastMessage = displayMessages[displayMessages.length - 1];

  // 根据消息状态和输入框内容自动更新按钮状态
  useEffect(() => {
    if (!lastMessage) {
      setButtonState("send");
      return;
    }

    // 如果最后一条消息的 type 是 interrupt
    if (lastMessage.type === "interrupt") {
      // 如果输入框有内容，显示 send；否则显示 resume
      setButtonState(inputContent.trim() ? "send" : "resume");
      return;
    }

    // 如果最后一条是用户消息且状态为 pending 或 acked，显示 stop
    if ("status" in lastMessage) {
      const status = (lastMessage as any).status;
      if (status === "pending" || status === "acked") {
        setButtonState("stop");
        return;
      }
    }

    // 如果最后一条是流式消息（partial），显示 stop
    if (("message" in lastMessage || "think" in lastMessage) && (lastMessage as any).partial) {
      setButtonState("stop");
      return;
    }

    // 其他情况显示 send
    setButtonState("send");
  }, [lastMessage, inputContent]);

  const handleSend = () => {
    if (!inputContent.trim()) {
      toast.warning("请输入消息内容");
      return;
    }

    // 如果没有 taskId，生成一个新的
    // 发送消息后，服务端会返回 ack，自动更新 taskId
    const currentTaskId = taskId || uuidv4();

    sendMessage({
      data: { message: inputContent, taskId: currentTaskId, updateTime: Date.now() },
      type: "userSendMessage",
    });
    setInputContent("");
  };

  const handleStop = () => {
    if (!taskId) {
      toast.error("找不到当前任务");
      return;
    }

    sendMessage({ type: "interrupt", data: { taskId, updateTime: new Date().valueOf() } });
    // 立即切换按钮状态
    setButtonState("send");
  };

  const handleResume = () => {
    if (!taskId) {
      toast.error("找不到当前任务");
      return;
    }

    // Resume 就是继续对话，发送 resume 消息让服务端恢复执行
    sendMessage({
      type: "resume",
      data: { taskId },
    });
  };

  const handleClick = () => {
    if (buttonState === "send") {
      handleSend();
    } else if (buttonState === "stop") {
      handleStop();
    } else {
      handleResume();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleClick();
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
      />
      <button
        onClick={handleClick}
        className="btn btn-primary btn-square"
        type="button"
      >
        {buttonState === "stop" && <FaStop className="w-4 h-4" />}
        {buttonState === "resume" && <FaPlay className="w-4 h-4" />}
        {buttonState === "send" && <FaPaperPlane className="w-4 h-4" />}
      </button>
    </div>
  );
};

export default MessageInput;
