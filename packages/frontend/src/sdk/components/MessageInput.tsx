import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUp, Play, Square } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useConnection } from "../hooks/useConnection";
import { useMentions } from "../hooks/useMentions";
import { useSendMessage } from "../hooks/useSendMessage";
import { useTasks } from "../hooks/useTasks";

/**
 * Props for the MessageInput component
 */
export interface MessageInputProps {
  /** Optional task ID. If not provided, uses the current task */
  taskId?: string;
  /** Additional CSS class name */
  className?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Callback when message is sent */
  onSend?: (message: string) => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether to show mention support */
  showMentions?: boolean;
}

/**
 * Ref interface for MessageInput
 */
export interface MessageInputRef {
  focus: () => void;
  insertMention: (sessionId: string, sessionTitle: string) => void;
  clear: () => void;
}

/**
 * MessageInput component with TipTap editor and mention support
 *
 * Provides a rich text input with mention support, send/interrupt/resume functionality,
 * and integration with the SDK's message sending system.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <MessageInput placeholder="Type a message..." />
 *
 * // With specific task
 * <MessageInput taskId="task-123" />
 *
 * // With custom callback
 * <MessageInput onSend={(message) => console.log('Sent:', message)} />
 *
 * // Disabled state
 * <MessageInput disabled={true} />
 * ```
 */
export const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(
  (
    {
      taskId,
      className = "",
      placeholder = "Type a message...",
      onSend,
      disabled = false,
      showMentions = true,
    },
    ref,
  ) => {
    const { sendMessage, sendInterrupt, sendResume, sendCreateTask } = useSendMessage();
    const { getMentionSuggestions } = useMentions();
    const { isConnected } = useConnection();
    const { mainTaskId } = useTasks();
    const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
    const [buttonState, setButtonState] = useState<"send" | "stop" | "resume">("send");
    const isSuggestionActiveRef = useRef(false);

    // Create mention suggestion configuration
    const suggestionConfig = showMentions
      ? {
          items: ({ query }: { query: string }) => {
            return getMentionSuggestions(query).slice(0, 10);
          },
          render: () => {
            let component: any;
            let popup: any;

            return {
              onStart: (props: any) => {
                isSuggestionActiveRef.current = true;

                component = document.createElement("div");
                component.className =
                  "mention-suggestions bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto";

                popup = document.createElement("div");
                popup.className = "fixed z-50";
                popup.appendChild(component);
                document.body.appendChild(popup);

                const updatePosition = () => {
                  const { range } = props;
                  const { view } = props.editor;
                  const { from } = range;
                  const start = view.coordsAtPos(from);

                  popup.style.left = `${start.left}px`;
                  popup.style.top = `${start.bottom + 8}px`;
                };

                updatePosition();
              },

              onUpdate: (props: any) => {
                const { items } = props;

                component.innerHTML = "";

                if (items.length === 0) {
                  const noResults = document.createElement("div");
                  noResults.className = "px-3 py-2 text-sm text-gray-500";
                  noResults.textContent = "No suggestions";
                  component.appendChild(noResults);
                  return;
                }

                items.forEach((item: any, index: number) => {
                  const button = document.createElement("button");
                  button.className = `w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                    index === props.selectedIndex ? "bg-blue-50 text-blue-600" : "text-gray-900"
                  }`;
                  button.textContent = item.label;
                  button.onclick = () => props.command({ id: item.id, label: item.label });
                  component.appendChild(button);
                });
              },

              onKeyDown: (props: any) => {
                if (props.event.key === "Escape") {
                  isSuggestionActiveRef.current = false;
                  return true;
                }
                return false;
              },

              onExit: () => {
                isSuggestionActiveRef.current = false;
                if (popup) {
                  document.body.removeChild(popup);
                }
              },
            };
          },
        }
      : undefined;

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
          placeholder,
        }),
        ...(showMentions && suggestionConfig
          ? [
              Mention.configure({
                HTMLAttributes: {
                  class: "mention bg-blue-100 text-blue-600 px-2 py-1 rounded font-medium",
                },
                suggestion: suggestionConfig,
              }),
            ]
          : []),
      ],
      content: "",
      editorProps: {
        attributes: {
          class: "focus:outline-none",
        },
        handleKeyDown,
      },
      editable: !disabled,
    });

    // Update button state based on connection and content
    useEffect(() => {
      if (!isConnected) {
        setButtonState("resume");
      } else if (editor?.getText().trim()) {
        setButtonState("send");
      } else {
        setButtonState("send");
      }
    }, [isConnected, editor?.getText()]);

    // Insert mention to editor
    const insertMention = useCallback(
      (sessionId: string, sessionTitle: string) => {
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
      },
      [editor],
    );

    // Clear editor content
    const clear = useCallback(() => {
      if (!editor) return;
      editor.commands.clearContent();
      setTargetSessionId(null);
    }, [editor]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focus: () => {
        editor?.commands.focus();
      },
      insertMention,
      clear,
    }));

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
              child as { type?: string; attrs?: { id?: string }; content?: unknown[] },
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
      if (!editor || disabled) return;

      // Extract session ID from mention nodes
      const extractedSessionId = extractSessionIdFromEditor();
      const effectiveSessionId = extractedSessionId || targetSessionId;

      // Get plain text content (without mention nodes)
      const content = getTextWithoutMentions();

      if (!content) {
        return;
      }

      // 判断是否需要创建新任务
      const currentMainTaskId = mainTaskId || taskId;

      if (!currentMainTaskId || currentMainTaskId.trim() === "") {
        // 没有 mainTaskId，发送 createTask 消息
        sendCreateTask(content);
      } else {
        // 有 mainTaskId，发送普通消息
        sendMessage(content, effectiveSessionId || currentMainTaskId);
      }

      // Call onSend callback if provided
      onSend?.(content);

      // Clear editor
      clear();
    };

    const handleStop = () => {
      if (disabled) return;
      sendInterrupt(taskId);
    };

    const handleResume = () => {
      if (disabled) return;
      sendResume(taskId);
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

    const isButtonDisabled = disabled || (buttonState === "send" && !editor?.getText().trim());

    return (
      <div className={`message-input-container ${className}`}>
        <style>{editorStyles}</style>
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
                    : isButtonDisabled
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
              type="button"
              disabled={isButtonDisabled}
            >
              {buttonState === "stop" && <Square className="w-4 h-4" fill="currentColor" />}
              {buttonState === "resume" && <Play className="w-4 h-4" fill="currentColor" />}
              {buttonState === "send" && <ArrowUp className="w-5 h-5" strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>
    );
  },
);

MessageInput.displayName = "MessageInput";

// Styles for the component
const editorStyles = `
  .message-input-container {
    width: 100%;
    position: sticky;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 32px 24px;
    background: #fafafa;
    z-index: 10;
  }

  .tiptap-editor-wrapper {
    position: relative;
    max-width: 800px;
    margin: 0 auto;
  }
  
  .tiptap-editor-wrapper .ProseMirror {
    min-height: 80px;
    max-height: 240px;
    overflow-y: auto;
    padding: 16px 60px 16px 20px;
    border-radius: 16px;
    border: 1px solid #e5e5e5;
    background-color: #ffffff;
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.08);
    font-size: 15px;
    line-height: 1.6;
    transition: border-color 200ms ease-in-out, box-shadow 200ms ease-in-out;
    outline: none;
  }

  .tiptap-editor-wrapper .ProseMirror::-webkit-scrollbar {
    width: 6px;
  }

  .tiptap-editor-wrapper .ProseMirror::-webkit-scrollbar-track {
    background: transparent;
  }

  .tiptap-editor-wrapper .ProseMirror::-webkit-scrollbar-thumb {
    background: #d4d4d4;
    border-radius: 3px;
  }

  .tiptap-editor-wrapper .ProseMirror::-webkit-scrollbar-thumb:hover {
    background: #a3a3a3;
  }
  
  .tiptap-editor-wrapper .ProseMirror:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgb(59 130 246 / 0.1);
    outline: none;
  }

  .send-button-wrapper {
    position: absolute;
    right: 10px;
    bottom: 10px;
    z-index: 10;
  }
  
  .tiptap-editor-wrapper .ProseMirror p.is-editor-empty:first-child::before {
    color: #a3a3a3;
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }
  
  .tiptap-editor-wrapper .ProseMirror p {
    margin: 0;
  }
  
  .mention-suggestions {
    min-width: 200px;
  }
`;

export default MessageInput;
