import type { UserMessageAttachment } from "@amigo-llm/types";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  ArrowUp,
  FileText,
  Image as ImageIcon,
  Loader2,
  Music,
  Paperclip,
  Play,
  Square,
  Video,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { toast } from "../../utils/toast";
import { useWebSocketContext } from "../context/WebSocketContext";
import { useConnection } from "../hooks/useConnection";
import { useMentions } from "../hooks/useMentions";
import { useSendMessage } from "../hooks/useSendMessage";
import { useTasks } from "../hooks/useTasks";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { ToolConfirmationRequest } from "./ToolConfirmationRequest";

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

type AttachmentUploadStatus = "uploading" | "uploaded" | "error";

type InputAttachment = {
  id: string;
  file?: File;
  name: string;
  mimeType: string;
  size: number;
  kind: UserMessageAttachment["kind"];
  status: AttachmentUploadStatus;
  progress: number;
  url?: string;
  objectKey?: string;
  previewUrl?: string;
  error?: string;
};

type OssPolicyResponse = {
  provider: "aliyun-oss";
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresAt: string;
  formFields: Record<string, string>;
};

const MAX_ATTACHMENT_COUNT = 8;
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_TOTAL_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50MB per message

const getAttachmentKind = (file: File): UserMessageAttachment["kind"] => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
};

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getHttpBaseUrlFromWebSocketUrl = (wsUrl: string): string => {
  const parsed = new URL(wsUrl);
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
};

const requestOssPolicy = async (wsUrl: string, file: File): Promise<OssPolicyResponse> => {
  const baseUrl = getHttpBaseUrlFromWebSocketUrl(wsUrl);
  const response = await fetch(`${baseUrl}/api/uploads/oss/policy`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });

  if (response.status === 404 || response.status === 501) {
    throw new Error("服务器未配置 OSS 上传签名接口");
  }

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `OSS policy request failed (${response.status})`);
  }

  return (await response.json()) as OssPolicyResponse;
};

const uploadFileToAliyunOssWithProgress = (
  policy: OssPolicyResponse,
  file: File,
  onProgress: (progress: number) => void,
) => {
  const formData = new FormData();
  Object.entries(policy.formFields).forEach(([key, value]) => {
    formData.append(key, value);
  });
  formData.append("file", file);
  let xhr: XMLHttpRequest | null = new XMLHttpRequest();

  const promise = new Promise<void>((resolve, reject) => {
    if (!xhr) {
      reject(new Error("Upload initialization failed"));
      return;
    }

    xhr.open("POST", policy.uploadUrl);
    onProgress(10);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const next = Math.max(10, Math.min(99, Math.round((event.loaded / event.total) * 100)));
      onProgress(next);
    };

    xhr.onerror = () => {
      reject(new Error("OSS upload failed (network error)"));
    };

    xhr.onabort = () => {
      reject(new Error("UPLOAD_ABORTED"));
    };

    xhr.onload = () => {
      const status = xhr?.status || 0;
      if (status >= 200 && status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error((xhr?.responseText || "").trim() || `OSS upload failed (${status})`));
    };

    xhr.send(formData);
  }).finally(() => {
    xhr = null;
  });

  return {
    promise,
    abort: () => xhr?.abort(),
  };
};

const deleteOssObjectViaServer = async (wsUrl: string, objectKey: string): Promise<void> => {
  const baseUrl = getHttpBaseUrlFromWebSocketUrl(wsUrl);
  const response = await fetch(`${baseUrl}/api/uploads/oss/delete`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ objectKey }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `OSS delete request failed (${response.status})`);
  }
};

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
    const { config } = useWebSocketContext();
    const { sendMessage, sendInterrupt, sendResume, sendCreateTask } = useSendMessage();
    const { getMentionSuggestions } = useMentions();
    const { isConnected } = useConnection();
    const { mainTaskId, tasks } = useTasks();
    const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
    const [buttonState, setButtonState] = useState<"send" | "stop" | "resume">("send");
    const [pendingAttachments, setPendingAttachments] = useState<InputAttachment[]>([]);
    const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
    const isSuggestionActiveRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const uploadAbortMapRef = useRef<Record<string, () => void>>({});

    // Get current task's status
    const currentTaskId = taskId || mainTaskId;
    const currentTask = currentTaskId ? tasks[currentTaskId] : null;
    const taskStatus = currentTask?.status || "idle";

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
        void handleSend();
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

    // Update button state based on task status
    useEffect(() => {
      if (taskStatus === "streaming") {
        setButtonState("stop");
      } else if (taskStatus === "interrupted") {
        setButtonState("resume");
      } else {
        // idle, completed, error, waiting_tool_call states
        setButtonState("send");
      }
    }, [taskStatus]);

    useEffect(() => {
      return () => {
        Object.values(uploadAbortMapRef.current).forEach((abort) => {
          abort();
        });
        uploadAbortMapRef.current = {};
      };
    }, []);

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
      setTargetSessionId(null);
      Object.values(uploadAbortMapRef.current).forEach((abort) => {
        abort();
      });
      uploadAbortMapRef.current = {};
      setPendingAttachments((prev) => {
        prev.forEach((item) => {
          if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
          }
        });
        return [];
      });
      setPreviewImage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (!editor) return;
      editor.commands.clearContent();
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

    const startAttachmentUpload = useCallback(
      async (attachment: InputAttachment, file: File) => {
        try {
          setPendingAttachments((prev) =>
            prev.map((item) =>
              item.id === attachment.id && item.status === "uploading"
                ? { ...item, progress: Math.max(item.progress, 2) }
                : item,
            ),
          );
          const policy = await requestOssPolicy(config.url, file);
          setPendingAttachments((prev) =>
            prev.map((item) =>
              item.id === attachment.id && item.status === "uploading"
                ? { ...item, progress: Math.max(item.progress, 6) }
                : item,
            ),
          );
          const uploader = uploadFileToAliyunOssWithProgress(policy, file, (progress) => {
            setPendingAttachments((prev) =>
              prev.map((item) =>
                item.id === attachment.id && item.status === "uploading"
                  ? { ...item, progress }
                  : item,
              ),
            );
          });

          uploadAbortMapRef.current[attachment.id] = uploader.abort;
          await uploader.promise;
          delete uploadAbortMapRef.current[attachment.id];

          setPendingAttachments((prev) =>
            prev.map((item) =>
              item.id === attachment.id
                ? {
                    ...item,
                    status: "uploaded",
                    progress: 100,
                    url: policy.publicUrl,
                    objectKey: policy.objectKey,
                    error: undefined,
                    file: undefined,
                  }
                : item,
            ),
          );
        } catch (error) {
          delete uploadAbortMapRef.current[attachment.id];
          const message = error instanceof Error ? error.message : String(error);
          if (message === "UPLOAD_ABORTED") {
            return;
          }
          setPendingAttachments((prev) =>
            prev.map((item) =>
              item.id === attachment.id
                ? {
                    ...item,
                    status: "error",
                    error: message,
                  }
                : item,
            ),
          );
        }
      },
      [config.url],
    );

    const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files || []);
      if (selectedFiles.length === 0) {
        return;
      }

      const newAttachments: Array<{ attachment: InputAttachment; file: File }> = [];
      setPendingAttachments((prev) => {
        const next = [...prev];
        const existingKeys = new Set(
          prev.map((item) => `${item.name}:${item.size}:${item.mimeType}`),
        );
        let totalSize = next.reduce((sum, item) => sum + item.size, 0);

        for (const file of selectedFiles) {
          const fileKey = `${file.name}:${file.size}:${file.type}`;
          if (existingKeys.has(fileKey)) {
            continue;
          }
          if (next.length >= MAX_ATTACHMENT_COUNT) {
            toast.warning(`最多可上传 ${MAX_ATTACHMENT_COUNT} 个附件`);
            break;
          }
          if (file.size > MAX_ATTACHMENT_SIZE) {
            toast.error(`文件过大（>${formatFileSize(MAX_ATTACHMENT_SIZE)}）：${file.name}`);
            continue;
          }
          if (totalSize + file.size > MAX_TOTAL_ATTACHMENT_SIZE) {
            toast.error(`附件总大小超过 ${formatFileSize(MAX_TOTAL_ATTACHMENT_SIZE)}`);
            break;
          }

          const id =
            globalThis.crypto && "randomUUID" in globalThis.crypto
              ? globalThis.crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const kind = getAttachmentKind(file);
          const previewUrl = kind === "image" ? URL.createObjectURL(file) : undefined;
          const attachment: InputAttachment = {
            id,
            file,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            kind,
            status: "uploading",
            progress: 0,
            previewUrl,
          };

          next.push(attachment);
          newAttachments.push({ attachment, file });
          existingKeys.add(fileKey);
          totalSize += file.size;
        }

        return next;
      });

      event.target.value = "";

      for (const item of newAttachments) {
        void startAttachmentUpload(item.attachment, item.file);
      }
    };

    const handleRemoveAttachment = (attachmentId: string) => {
      const targetAttachment = pendingAttachments.find((item) => item.id === attachmentId);
      const abort = uploadAbortMapRef.current[attachmentId];
      if (abort) {
        abort();
        delete uploadAbortMapRef.current[attachmentId];
      }
      setPendingAttachments((prev) => {
        const target = prev.find((item) => item.id === attachmentId);
        if (target?.previewUrl) {
          URL.revokeObjectURL(target.previewUrl);
        }
        if (previewImage?.url && target?.previewUrl === previewImage.url) {
          setPreviewImage(null);
        }
        return prev.filter((item) => item.id !== attachmentId);
      });

      if (targetAttachment?.status === "uploaded" && targetAttachment.objectKey) {
        void deleteOssObjectViaServer(config.url, targetAttachment.objectKey).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          toast.error(`删除 OSS 附件失败：${message}`);
        });
      }
    };

    const handleSend = async () => {
      if (!editor || disabled) return;

      // Extract session ID from mention nodes
      const extractedSessionId = extractSessionIdFromEditor();
      const effectiveSessionId = extractedSessionId || targetSessionId;

      // Get plain text content (without mention nodes)
      const content = getTextWithoutMentions();
      const hasAttachments = pendingAttachments.length > 0;

      if (!content && !hasAttachments) {
        return;
      }

      const uploadingCount = pendingAttachments.filter(
        (item) => item.status === "uploading",
      ).length;
      const errorCount = pendingAttachments.filter((item) => item.status === "error").length;
      if (uploadingCount > 0) {
        toast.warning(`还有 ${uploadingCount} 个附件正在上传，请稍候`);
        return;
      }
      if (errorCount > 0) {
        toast.error("存在上传失败的附件，请删除后再发送");
        return;
      }
      const attachments = pendingAttachments
        .filter(
          (item): item is InputAttachment & { url: string } =>
            item.status === "uploaded" && !!item.url,
        )
        .map(
          (item): UserMessageAttachment => ({
            id: item.id,
            name: item.name,
            mimeType: item.mimeType,
            size: item.size,
            kind: item.kind,
            url: item.url,
          }),
        );

      // 判断是否需要创建新任务
      const currentTaskTargetId = taskId || mainTaskId;

      if (!currentTaskTargetId || currentTaskTargetId.trim() === "") {
        // 没有 mainTaskId，发送 createTask 消息（支持附件）
        sendCreateTask(content, attachments);
      } else {
        // 有 mainTaskId，发送普通消息
        sendMessage(content, effectiveSessionId || currentTaskTargetId, attachments);
      }

      // Call onSend callback if provided
      onSend?.(content);

      // Clear editor
      clear();
    };

    const handleStop = () => {
      if (disabled) return;
      sendInterrupt(currentTaskId || undefined);
    };

    const handleResume = () => {
      if (disabled) return;
      sendResume(currentTaskId || undefined);
    };

    const handleClick = () => {
      if (buttonState === "send") {
        void handleSend();
      } else if (buttonState === "stop") {
        handleStop();
      } else {
        handleResume();
      }
    };

    const isButtonDisabled =
      disabled ||
      !isConnected ||
      (buttonState === "send" &&
        pendingAttachments.some(
          (item) => item.status === "uploading" || item.status === "error",
        )) ||
      (buttonState === "send" && !editor?.getText().trim() && pendingAttachments.length === 0);
    const isAttachmentButtonDisabled = disabled || !isConnected || buttonState !== "send";

    const getAttachmentIcon = (kind: UserMessageAttachment["kind"]) => {
      if (kind === "image") return <ImageIcon className="w-3.5 h-3.5" />;
      if (kind === "video") return <Video className="w-3.5 h-3.5" />;
      if (kind === "audio") return <Music className="w-3.5 h-3.5" />;
      return <FileText className="w-3.5 h-3.5" />;
    };

    return (
      <div className={`message-input-container ${className}`}>
        <style>{editorStyles}</style>
        <div className="tiptap-editor-wrapper">
          <ToolConfirmationRequest taskId={currentTaskId || ""} className="mb-4" />
          {pendingAttachments.length > 0 && (
            <div className="attachment-list">
              {pendingAttachments.map((attachment) => (
                <div key={attachment.id} className="attachment-chip" title={attachment.mimeType}>
                  <button
                    type="button"
                    className={`attachment-chip-main ${attachment.kind === "image" && attachment.previewUrl ? "is-clickable" : ""}`}
                    onClick={() => {
                      if (attachment.kind === "image" && attachment.previewUrl) {
                        setPreviewImage({ url: attachment.previewUrl, name: attachment.name });
                      }
                    }}
                    disabled={!(attachment.kind === "image" && attachment.previewUrl)}
                  >
                    {attachment.kind === "image" && attachment.previewUrl ? (
                      <span className="attachment-thumb-wrap">
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.name}
                          className="attachment-thumb"
                        />
                        {attachment.status !== "uploaded" && (
                          <span
                            className={`attachment-thumb-overlay ${
                              attachment.status === "error" ? "is-error" : ""
                            }`}
                          >
                            {attachment.status === "uploading" ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>{Math.max(1, attachment.progress)}%</span>
                              </>
                            ) : (
                              <span>失败</span>
                            )}
                          </span>
                        )}
                      </span>
                    ) : (
                      getAttachmentIcon(attachment.kind)
                    )}
                    <span className="attachment-chip-name">{attachment.name}</span>
                    <span className="attachment-chip-size">{formatFileSize(attachment.size)}</span>
                  </button>
                  {attachment.kind !== "image" && (
                    <span
                      className={`attachment-chip-status ${
                        attachment.status === "uploaded"
                          ? "is-success"
                          : attachment.status === "error"
                            ? "is-error"
                            : ""
                      }`}
                    >
                      {attachment.status === "uploaded"
                        ? "已上传"
                        : attachment.status === "error"
                          ? "失败"
                          : "上传中"}
                    </span>
                  )}
                  {attachment.status === "error" && attachment.error && (
                    <span className="attachment-chip-error" title={attachment.error}>
                      {attachment.error}
                    </span>
                  )}
                  <button
                    type="button"
                    className="attachment-chip-remove"
                    onClick={() => handleRemoveAttachment(attachment.id)}
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <EditorContent editor={editor} />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <div className="attachment-button-wrapper">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center justify-center w-[40px] h-[40px] rounded-full border border-[#e5e7eb] transition-all ${
                isAttachmentButtonDisabled
                  ? "bg-[#f3f4f6] text-gray-400 cursor-not-allowed"
                  : "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
              disabled={isAttachmentButtonDisabled}
              title="上传图片、视频或文件"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>
          <div className="send-button-wrapper">
            <button
              onClick={handleClick}
              className={`flex items-center justify-center w-[40px] h-[40px] rounded-full transition-all duration-200 ${
                buttonState === "stop"
                  ? "bg-red-500 hover:bg-red-600 text-white shadow-sm"
                  : buttonState === "resume"
                    ? "bg-green-500 hover:bg-green-600 text-white shadow-sm"
                    : isButtonDisabled
                      ? "bg-[#f3f4f6] text-gray-400 cursor-not-allowed"
                      : "bg-[#f3f4f6] text-gray-600 hover:bg-[#e5e7eb] hover:text-gray-800 shadow-sm"
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
        <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
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
    padding: 16px 24px 32px;
    background: transparent;
    z-index: 10;
  }

  .tiptap-editor-wrapper {
    position: relative;
    max-width: 800px;
    margin: 0 auto;
  }
  
  .tiptap-editor-wrapper .ProseMirror {
    min-height: 60px;
    max-height: 320px;
    overflow-y: auto;
    padding: 18px 64px 18px 60px;
    border-radius: 30px;
    border: 1px solid #e5e7eb;
    background-color: #ffffff;
    box-shadow: 0 4px 20px -5px rgba(0, 0, 0, 0.05);
    font-size: 15px;
    font-weight: 400;
    line-height: 1.5;
    transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
    outline: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .tiptap-editor-wrapper .ProseMirror:focus {
    border-color: #d1d5db;
    box-shadow: 0 4px 25px -5px rgba(0, 0, 0, 0.08);
    outline: none;
  }

  .attachment-button-wrapper {
    position: absolute;
    left: 10px;
    bottom: 10px;
    z-index: 10;
  }

  .send-button-wrapper {
    position: absolute;
    right: 10px;
    bottom: 10px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tiptap-editor-wrapper .ProseMirror p.is-editor-empty:first-child::before {
    color: #9ca3af;
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

  .attachment-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }

  .attachment-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    min-width: 0;
    max-width: 100%;
  }

  .attachment-chip-main {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    color: inherit;
  }

  .attachment-chip-main.is-clickable {
    cursor: pointer;
  }

  .attachment-thumb {
    width: 22px;
    height: 22px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .attachment-thumb-wrap {
    position: relative;
    display: inline-flex;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }

  .attachment-thumb-overlay {
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-radius: 6px;
    background: rgba(17, 24, 39, 0.55);
    color: #fff;
    font-size: 9px;
    font-weight: 600;
    line-height: 1;
  }

  .attachment-thumb-overlay.is-error {
    background: rgba(185, 28, 28, 0.78);
  }

  .attachment-chip-name {
    font-size: 12px;
    color: #111827;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-chip-size {
    font-size: 11px;
    color: #6b7280;
    flex-shrink: 0;
  }

  .attachment-chip-status {
    font-size: 11px;
    color: #6b7280;
    background: #f3f4f6;
    border-radius: 9999px;
    padding: 2px 6px;
    flex-shrink: 0;
  }

  .attachment-chip-status.is-success {
    color: #065f46;
    background: #d1fae5;
  }

  .attachment-chip-status.is-error {
    color: #991b1b;
    background: #fee2e2;
  }

  .attachment-chip-error {
    max-width: 180px;
    font-size: 11px;
    color: #b91c1c;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
    padding: 0;
  }

  .attachment-chip-remove:hover {
    color: #111827;
  }

`;

export default MessageInput;
