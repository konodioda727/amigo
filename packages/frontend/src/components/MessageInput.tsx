import { useState, useRef, forwardRef, useImperativeHandle, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { ArrowUp, Play, Square } from "lucide-react";
import { useWebSocket } from "./WebSocketProvider";
import { toast } from "@/utils/toast";
import { useActiveSessions } from "./MessageInput/useActiveSessions";
import { useMentionSuggestion } from "./MessageInput/useMentionSuggestion";
import { useButtonState } from "./MessageInput/useButtonState";
import { editorStyles } from "./MessageInput/styles";
import { v4 as uuidv4 } from "uuid";

export interface MessageInputRef {
  focus: () => void;
}

const MessageInput = forwardRef<MessageInputRef>((_, ref) => {
  const { sendMessage, taskId, registerInputFocus } = useWebSocket();
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
      handleSend();
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
        placeholder: "输入消息或选择技能...",
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

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      editor?.commands.focus();
    },
  }));

  // Register focus function with context
  useEffect(() => {
    if (editor) {
      registerInputFocus(() => {
        editor.commands.focus();
      });
    }
  }, [editor, registerInputFocus]);

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

  const getTextWithoutMentions = (): string => {
    if (!editor) return "";

    const json = editor.getJSON();
    
    type NodeType = {
      type?: string;
      text?: string;
      content?: NodeType[];
    };
    
    const extractText = (node: NodeType): string => {
      // Skip mention nodes
      if (node.type === "mention") {
        return "";
      }
      
      // If it's a text node, return the text
      if (node.type === "text" && node.text) {
        return node.text;
      }
      
      // If it has content, recursively extract text
      if (node.content && Array.isArray(node.content)) {
        return node.content.map((child) => extractText(child)).join("");
      }
      
      return "";
    };
    
    return extractText(json as NodeType).trim();
  };

  const handleSend = () => {
    if (!editor) return;

    // Extract session ID from mention nodes
    const extractedSessionId = extractSessionIdFromEditor();
    const effectiveSessionId = extractedSessionId || targetSessionId;

    // Get plain text content (without mention nodes)
    const content = getTextWithoutMentions();

    if (!content) {
      toast.warning("请输入消息内容");
      return;
    }

    const currentTaskId = taskId || uuidv4();
    const messageTaskId = effectiveSessionId || currentTaskId;

    sendMessage({
      data: { message: content, taskId: messageTaskId, updateTime: Date.now() },
      type: "userSendMessage",
    });

    editor.commands.clearContent();
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
      <div className="message-input-container">
        <div className="tiptap-editor-wrapper">
          <EditorContent editor={editor} />
          <div className="send-button-wrapper">
            <button
              onClick={handleClick}
              className={`btn btn-circle w-10 h-10 transition-all duration-200 border-0 ${
                buttonState === "stop" 
                  ? "bg-red-500 hover:bg-red-600 text-white" 
                  : buttonState === "resume"
                  ? "bg-green-500 hover:bg-green-600 text-white"
                  : buttonState === "send" && !editor?.getText().trim()
                  ? "bg-gray-200 text-black cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
              type="button"
              disabled={buttonState === "send" && !editor?.getText().trim()}
            >
              {buttonState === "stop" && <Square className="w-4 h-4" fill="currentColor" />}
              {buttonState === "resume" && <Play className="w-4 h-4" fill="currentColor" />}
              {buttonState === "send" && <ArrowUp className="w-5 h-5" strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
});

MessageInput.displayName = "MessageInput";

export default MessageInput;
