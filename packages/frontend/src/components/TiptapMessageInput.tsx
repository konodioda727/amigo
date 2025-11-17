import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { FaPaperPlane, FaPlay, FaStop } from "react-icons/fa";
import { useWebSocket } from "./WebSocketProvider";
import { v4 as uuidv4 } from "uuid";
import { toast } from "@/utils/toast";

type ButtonState = "send" | "stop" | "resume";

// Add custom styles for Tiptap editor
const editorStyles = `
  .tiptap-editor-wrapper {
    flex-grow: 1;
  }
  
  .tiptap-editor-wrapper .ProseMirror {
    min-height: 3rem;
    max-height: 12rem;
    overflow-y: auto;
    padding: 0.75rem;
    border-radius: var(--rounded-btn, 0.5rem);
    border-width: 1px;
    border-color: hsl(var(--bc) / 0.2);
    background-color: hsl(var(--b1));
    outline: none;
  }
  
  .tiptap-editor-wrapper .ProseMirror:focus {
    outline: 2px solid hsl(var(--bc) / 0.2);
    outline-offset: 2px;
  }
  
  .tiptap-editor-wrapper .ProseMirror p.is-editor-empty:first-child::before {
    color: hsl(var(--bc) / 0.4);
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }
  
  .tiptap-editor-wrapper .ProseMirror p {
    margin: 0;
  }
`;

const TiptapMessageInput = () => {
  const { sendMessage, displayMessages, taskId } = useWebSocket();
  const [buttonState, setButtonState] = useState<ButtonState>("send");

  // Initialize Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Configure hardBreak to handle Shift+Enter
        hardBreak: {
          keepMarks: true,
        },
      }),
      Placeholder.configure({
        placeholder: "输入消息...",
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "focus:outline-none",
      },
      handleKeyDown: (_view, event) => {
        // Handle Enter key to submit (without Shift)
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleClick();
          return true;
        }
        // Shift+Enter will create a line break (handled by hardBreak extension)
        return false;
      },
    },
  });

  const lastMessage = displayMessages[displayMessages.length - 1];

  // Update button state based on message status and input content
  useEffect(() => {
    if (!lastMessage) {
      setButtonState("send");
      return;
    }

    // If last message type is interrupt
    if (lastMessage.type === "interrupt") {
      // Show send if input has content, otherwise show resume
      const hasContent = editor?.getText().trim();
      setButtonState(hasContent ? "send" : "resume");
      return;
    }

    // If last message is user message with pending or acked status, show stop
    if ("status" in lastMessage) {
      const status = (lastMessage as { status: string }).status;
      if (status === "pending" || status === "acked") {
        setButtonState("stop");
        return;
      }
    }

    // If last message is streaming (partial), show stop
    if (("message" in lastMessage || "think" in lastMessage) && (lastMessage as { partial?: boolean }).partial) {
      setButtonState("stop");
      return;
    }

    // Default to send
    setButtonState("send");
  }, [lastMessage, editor]);

  const handleSend = () => {
    const content = editor?.getText().trim();
    
    if (!content) {
      toast.warning("请输入消息内容");
      return;
    }

    // Generate new taskId if none exists
    const currentTaskId = taskId || uuidv4();

    sendMessage({
      data: { message: content, taskId: currentTaskId, updateTime: Date.now() },
      type: "userSendMessage",
    });
    
    // Clear editor content
    editor?.commands.clearContent();
  };

  const handleStop = () => {
    if (!taskId) {
      toast.error("找不到当前任务");
      return;
    }

    sendMessage({ type: "interrupt", data: { taskId, updateTime: Date.now() } });
    setButtonState("send");
  };

  const handleResume = () => {
    if (!taskId) {
      toast.error("找不到当前任务");
      return;
    }

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

  return (
    <>
      <style>{editorStyles}</style>
      <div className="flex gap-2 mb-4">
        <div className="tiptap-editor-wrapper">
          <EditorContent editor={editor} />
        </div>
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
    </>
  );
};

export default TiptapMessageInput;
