import { useState, useRef, forwardRef, useImperativeHandle, useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { ArrowUp, Play, Square } from "lucide-react";
import { useWebSocketStore } from "@/store/websocket";
import { toast } from "@/utils/toast";
import { useActiveSessions } from "./hooks/useActiveSessions";
import { useMentionSuggestion } from "./hooks/useMentionSuggestion";
import { useButtonState } from "./hooks/useButtonState";
import { editorStyles } from "./styles";
import { v4 as uuidv4 } from "uuid";

export interface MessageInputRef {
  focus: () => void;
  insertMention: (sessionId: string, sessionTitle: string) => void;
}

const MessageInput = forwardRef<MessageInputRef>((_, ref) => {
  const mainTaskId = useWebSocketStore((state) => state.mainTaskId);
  const sendMessageAction = useWebSocketStore((state) => state.sendMessage);
  const pendingMention = useWebSocketStore((state) => state.pendingMention);
  const clearPendingMention = useWebSocketStore((state) => state.clearPendingMention);
  const clearInputRequested = useWebSocketStore((state) => state.clearInputRequested);
  const acknowledgeClearInput = useWebSocketStore((state) => state.acknowledgeClearInput);
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

  // 插入 mention 到编辑器
  const insertMention = useCallback((sessionId: string, sessionTitle: string) => {
    if (!editor) return;
    
    editor.commands.clearContent();
    editor.commands.insertContent([
      {
        type: "mention",
        attrs: {
          id: sessionId,
          label: sessionTitle,
        },
      },
      {
        type: "text",
        text: " ",
      },
    ]);
    editor.commands.focus("end");
    setTargetSessionId(sessionId);
  }, [editor]);

  // 监听 pendingMention 并自动插入
  useEffect(() => {
    if (pendingMention && editor) {
      insertMention(pendingMention.taskId, pendingMention.title);
      clearPendingMention();
    }
  }, [pendingMention, editor, insertMention, clearPendingMention]);

  // 监听 clearInputRequested 并清空输入框
  useEffect(() => {
    if (clearInputRequested && editor) {
      editor.commands.clearContent();
      setTargetSessionId(null);
      acknowledgeClearInput();
    }
  }, [clearInputRequested, editor, acknowledgeClearInput]);

  // 这些功能现在通过 zustand store 的 setActiveTask 管理

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      editor?.commands.focus();
    },
    insertMention,
  }));

  // 这些功能现在通过 zustand store 管理，不再需要注册回调

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

    // 使用 effectiveSessionId（如果 mention 了子任务）或 mainTaskId
    const targetTaskId = effectiveSessionId || mainTaskId || uuidv4();

    // 直接使用 sendMessageAction 并传入正确的 taskId
    sendMessageAction(targetTaskId, {
      type: "userSendMessage",
      data: { message: content, taskId: targetTaskId, updateTime: Date.now() },
    });

    editor.commands.clearContent();
    setTargetSessionId(null);

    // 发送消息后，延迟一下再切换到下一个任务（等待消息处理完成）
    setTimeout(() => {
      const store = useWebSocketStore.getState();
      store.updateFollowupQueue();
      store.mentionNextInQueue();
    }, 100);
  };

  const handleStop = () => {
    if (!mainTaskId) {
      toast.error("找不到当前任务");
      return;
    }
    sendMessageAction(mainTaskId, { type: "interrupt", data: { taskId: mainTaskId, updateTime: Date.now() } });
  };

  const handleResume = () => {
    if (!mainTaskId) {
      toast.error("找不到当前任务");
      return;
    }
    sendMessageAction(mainTaskId, { type: "resume", data: { taskId: mainTaskId } });
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
