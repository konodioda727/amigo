import { useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { FaPaperPlane, FaPlay, FaStop } from "react-icons/fa";
import { useWebSocket } from "./WebSocketProvider";
import { toast } from "@/utils/toast";
import { useActiveSessions } from "./MessageInput/useActiveSessions";
import { useMentionSuggestion } from "./MessageInput/useMentionSuggestion";
import { useButtonState } from "./MessageInput/useButtonState";
import { editorStyles } from "./MessageInput/styles";
import { v4 as uuidv4 } from "uuid";

const MessageInput = () => {
  const { sendMessage, taskId } = useWebSocket();
  const { getActiveSessions } = useActiveSessions();
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
  const isSuggestionActiveRef = useRef(false);

  const suggestionConfig = useMentionSuggestion({
    getActiveSessions,
    onSessionSelect: setTargetSessionId,
    onSuggestionStart: () => {
      isSuggestionActiveRef.current = true;
    },
    onSuggestionExit: () => {
      isSuggestionActiveRef.current = false;
    },
  });

  const handleKeyDown = (_view: unknown, event: KeyboardEvent) => {
    // Don't handle Enter if suggestion dropdown is visible
    if (event.key === "Enter" && !event.shiftKey && !isSuggestionActiveRef.current) {
      event.preventDefault();
      // Use setTimeout to ensure handleClick is defined
      setTimeout(() => {
        const content = editor?.getText().trim();
        if (!content) {
          toast.warning("请输入消息内容");
          return;
        }

        const extractedSessionId = extractSessionIdFromEditor();
        const effectiveSessionId = extractedSessionId || targetSessionId;
        const currentTaskId = taskId || uuidv4();
        const messageTaskId = effectiveSessionId || currentTaskId;

        sendMessage({
          data: { message: content, taskId: messageTaskId, updateTime: Date.now() },
          type: "userSendMessage",
        });

        editor?.commands.clearContent();
        setTargetSessionId(null);
      }, 0);
      return true;
    }
    return false;
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        hardBreak: {
          keepMarks: true,
        },
      }),
      Placeholder.configure({
        placeholder: "输入消息... (输入 / 选择会话)",
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        suggestion: suggestionConfig,
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "focus:outline-none",
      },
      handleKeyDown,
    },
  });

  const buttonState = useButtonState(editor);

  const extractSessionIdFromEditor = (): string | null => {
    if (!editor) return null;

    const json = editor.getJSON();
    const findMention = (node: {
      type?: string;
      attrs?: { id?: string };
      content?: unknown[];
    }): string | null => {
      if (node.type === "mention" && node.attrs?.id) {
        return node.attrs.id;
      }
      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          const result = findMention(
            child as { type?: string; attrs?: { id?: string }; content?: unknown[] }
          );
          if (result) return result;
        }
      }
      return null;
    };
    return findMention(json);
  };

  const handleSend = () => {
    const content = editor?.getText().trim();

    if (!content) {
      toast.warning("请输入消息内容");
      return;
    }

    const extractedSessionId = extractSessionIdFromEditor();
    const effectiveSessionId = extractedSessionId || targetSessionId;
    const currentTaskId = taskId || uuidv4();
    const messageTaskId = effectiveSessionId || currentTaskId;

    sendMessage({
      data: { message: content, taskId: messageTaskId, updateTime: Date.now() },
      type: "userSendMessage",
    });

    editor?.commands.clearContent();
    setTargetSessionId(null);
  };

  const handleStop = () => {
    if (!taskId) {
      toast.error("找不到当前任务");
      return;
    }
    sendMessage({ type: "interrupt", data: { taskId, updateTime: Date.now() } });
  };

  const handleResume = () => {
    if (!taskId) {
      toast.error("找不到当前任务");
      return;
    }
    sendMessage({ type: "resume", data: { taskId } });
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
        <button onClick={handleClick} className="btn btn-primary btn-square" type="button">
          {buttonState === "stop" && <FaStop className="w-4 h-4" />}
          {buttonState === "resume" && <FaPlay className="w-4 h-4" />}
          {buttonState === "send" && <FaPaperPlane className="w-4 h-4" />}
        </button>
      </div>
    </>
  );
};

export default MessageInput;
