import { useState, useRef, forwardRef, useImperativeHandle, useEffect, useCallback } from "react";
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
import { usePendingResponseQueue } from "./MessageInput/usePendingResponseQueue";
import { editorStyles } from "./MessageInput/styles";
import { v4 as uuidv4 } from "uuid";

export interface MessageInputRef {
  focus: () => void;
  insertMention: (sessionId: string, sessionTitle: string) => void;
}

const MessageInput = forwardRef<MessageInputRef>((_, ref) => {
  const { sendMessage, taskId, registerInputFocus, registerInputReset } = useWebSocket();
  const { getActiveSessions } = useActiveSessions();
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
  const isSuggestionActiveRef = useRef(false);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

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

  // 处理需要用户回答的会话
  const handleFocusSession = useCallback((sessionId: string, sessionTitle: string) => {
    // 如果是主会话，不需要插入 mention
    if (sessionId === taskId) {
      editor?.commands.focus();
      return;
    }
    // 子任务需要插入 mention
    insertMention(sessionId, sessionTitle);
  }, [taskId, editor, insertMention]);

  // 使用队列管理器
  const { markCurrentComplete } = usePendingResponseQueue({
    onFocusSession: handleFocusSession,
  });

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      editor?.commands.focus();
    },
    insertMention,
  }));

  // Register focus function with context
  useEffect(() => {
    if (editor) {
      registerInputFocus(() => {
        editor.commands.focus();
      });
    }
  }, [editor, registerInputFocus]);

  // Register reset function with context (清除 mention，保留文本内容)
  useEffect(() => {
    if (editor) {
      registerInputReset(() => {
        // 获取当前内容，过滤掉所有 mention
        const currentContent = editor.getJSON();
        const existingContent = (currentContent.content?.[0]?.content || [])
          .filter((node: { type?: string }) => node.type !== "mention");
        
        // 移除开头的空格
        if (existingContent.length > 0 && existingContent[0].type === "text") {
          const firstText = existingContent[0].text as string;
          const trimmedText = firstText.replace(/^\s+/, "");
          if (trimmedText) {
            existingContent[0] = { ...existingContent[0], text: trimmedText };
          } else {
            existingContent.shift();
          }
        }
        
        // 设置内容（只保留文本）
        if (existingContent.length > 0) {
          editor.commands.setContent([{ type: "paragraph", content: existingContent }]);
        } else {
          editor.commands.clearContent();
        }
        
        // 清除 targetSessionId
        setTargetSessionId(null);
      });
    }
  }, [editor, registerInputReset]);

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

    // 如果 mention 了子任务，使用 callSubTask 消息
    if (effectiveSessionId && effectiveSessionId !== currentTaskId) {
      sendMessage({
        type: "callSubTask",
        data: {
          taskId: currentTaskId,
          subTaskId: effectiveSessionId,
          message: content,
        },
      });
    } else {
      // 否则使用普通的 userSendMessage
      sendMessage({
        type: "userSendMessage",
        data: { message: content, taskId: currentTaskId, updateTime: Date.now() },
      });
    }

    editor.commands.clearContent();
    setTargetSessionId(null);
    // 标记当前会话已处理完成，处理队列中的下一个
    markCurrentComplete();
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
