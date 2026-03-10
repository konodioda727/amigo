import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUp, Paperclip, Play, Square } from "lucide-react";
import {
  type ChangeEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { toast } from "../../../utils/toast";
import { useWebSocketContext } from "../../context/WebSocketContext";
import { useConnection } from "../../hooks/useConnection";
import { useMentions } from "../../hooks/useMentions";
import { useSendMessage } from "../../hooks/useSendMessage";
import { useTasks } from "../../hooks/useTasks";
import { ImagePreviewModal } from "../ImagePreviewModal";
import {
  collectAttachmentsForUpload,
  deleteOssObjectViaServer,
  type InputAttachment,
  requestOssPolicy,
  toUploadedUserMessageAttachments,
  uploadFileToAliyunOssWithProgress,
} from "../messageInputAttachments";
import { ToolConfirmationRequest } from "../ToolConfirmationRequest";
import { AttachmentList } from "./AttachmentList";
import { messageInputEditorStyles } from "./editorStyles";
import {
  extractSessionIdFromEditorJson,
  getTextWithoutMentionsFromEditorJson,
} from "./editorUtils";
import { createMentionSuggestion } from "./mentionSuggestion";
import type { MessageInputProps, MessageInputRef } from "./types";

export const MessageInputImpl = forwardRef<MessageInputRef, MessageInputProps>(
  (
    {
      taskId,
      className = "",
      placeholder = "Type a message...",
      onSend,
      createTaskContext,
      disabled = false,
      showMentions = true,
      bottomAccessory,
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
    const handleSendRef = useRef<() => Promise<void>>(async () => {});
    const uploadAbortMapRef = useRef<Record<string, () => void>>({});

    const currentTaskId = taskId || mainTaskId;
    const currentTask = currentTaskId ? tasks[currentTaskId] : null;
    const taskStatus = currentTask?.status || "idle";

    const suggestionConfig = showMentions
      ? createMentionSuggestion({
          getItems: getMentionSuggestions,
          isSuggestionActiveRef,
        })
      : undefined;

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
                suggestion: suggestionConfig as never,
              }),
            ]
          : []),
      ],
      content: "",
      editorProps: {
        attributes: {
          class: "focus:outline-none",
        },
        handleKeyDown: (_view, event) => {
          if (event.key === "Enter" && !event.shiftKey && !isSuggestionActiveRef.current) {
            event.preventDefault();
            void handleSendRef.current();
            return true;
          }
          return false;
        },
      },
      editable: !disabled,
    });

    const updateAttachment = useCallback(
      (attachmentId: string, updater: (attachment: InputAttachment) => InputAttachment) => {
        setPendingAttachments((prev) =>
          prev.map((item) => (item.id === attachmentId ? updater(item) : item)),
        );
      },
      [],
    );

    useEffect(() => {
      if (taskStatus === "streaming") {
        setButtonState("stop");
      } else if (taskStatus === "interrupted") {
        setButtonState("resume");
      } else {
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

    const insertMention = useCallback(
      (sessionId: string, sessionTitle: string) => {
        if (!editor) {
          return;
        }

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
      if (!editor) {
        return;
      }
      editor.commands.clearContent();
    }, [editor]);

    const handleSend = useCallback(async () => {
      if (!editor || disabled) {
        return;
      }

      const editorJson = editor.getJSON();
      const extractedSessionId = extractSessionIdFromEditorJson(editorJson);
      const effectiveSessionId = extractedSessionId || targetSessionId;
      const content = getTextWithoutMentionsFromEditorJson(editorJson);
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

      const attachments = toUploadedUserMessageAttachments(pendingAttachments);
      const currentTaskTargetId = taskId || mainTaskId;

      if (!currentTaskTargetId || currentTaskTargetId.trim() === "") {
        sendCreateTask(content, attachments, createTaskContext);
      } else {
        sendMessage(content, effectiveSessionId || currentTaskTargetId, attachments);
      }

      onSend?.(content);
      clear();
    }, [
      clear,
      createTaskContext,
      disabled,
      editor,
      mainTaskId,
      onSend,
      pendingAttachments,
      sendCreateTask,
      sendMessage,
      targetSessionId,
      taskId,
    ]);

    handleSendRef.current = handleSend;

    useImperativeHandle(ref, () => ({
      focus: () => {
        editor?.commands.focus();
      },
      insertMention,
      clear,
    }));

    const startAttachmentUpload = useCallback(
      async (attachment: InputAttachment, file: File) => {
        try {
          updateAttachment(attachment.id, (item) =>
            item.status === "uploading" ? { ...item, progress: Math.max(item.progress, 2) } : item,
          );
          const policy = await requestOssPolicy(config.url, file);
          updateAttachment(attachment.id, (item) =>
            item.status === "uploading" ? { ...item, progress: Math.max(item.progress, 6) } : item,
          );
          const uploader = uploadFileToAliyunOssWithProgress(policy, file, (progress) => {
            updateAttachment(attachment.id, (item) =>
              item.status === "uploading" ? { ...item, progress } : item,
            );
          });

          uploadAbortMapRef.current[attachment.id] = uploader.abort;
          await uploader.promise;
          delete uploadAbortMapRef.current[attachment.id];

          updateAttachment(attachment.id, (item) => ({
            ...item,
            status: "uploaded",
            progress: 100,
            url: policy.publicUrl,
            objectKey: policy.objectKey,
            error: undefined,
            file: undefined,
          }));
        } catch (error) {
          delete uploadAbortMapRef.current[attachment.id];
          const message = error instanceof Error ? error.message : String(error);
          if (message === "UPLOAD_ABORTED") {
            return;
          }

          updateAttachment(attachment.id, (item) => ({
            ...item,
            status: "error",
            error: message,
          }));
        }
      },
      [config.url, updateAttachment],
    );

    const handleFileInputChange = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files || []);
        if (selectedFiles.length === 0) {
          return;
        }

        const { queuedUploads, notices } = collectAttachmentsForUpload(
          selectedFiles,
          pendingAttachments,
        );
        notices.forEach(({ level, message }) => {
          toast[level](message);
        });
        if (queuedUploads.length > 0) {
          setPendingAttachments((prev) => [
            ...prev,
            ...queuedUploads.map(({ attachment }) => attachment),
          ]);
        }

        event.target.value = "";

        for (const item of queuedUploads) {
          void startAttachmentUpload(item.attachment, item.file);
        }
      },
      [pendingAttachments, startAttachmentUpload],
    );

    const handleRemoveAttachment = useCallback(
      (attachmentId: string) => {
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
      },
      [config.url, pendingAttachments, previewImage?.url],
    );

    const handleStop = useCallback(() => {
      if (disabled) {
        return;
      }
      sendInterrupt(currentTaskId || undefined);
    }, [currentTaskId, disabled, sendInterrupt]);

    const handleResume = useCallback(() => {
      if (disabled) {
        return;
      }
      sendResume(currentTaskId || undefined);
    }, [currentTaskId, disabled, sendResume]);

    const handleClick = useCallback(() => {
      if (buttonState === "send") {
        void handleSend();
      } else if (buttonState === "stop") {
        handleStop();
      } else {
        handleResume();
      }
    }, [buttonState, handleResume, handleSend, handleStop]);

    const isButtonDisabled =
      disabled ||
      !isConnected ||
      (buttonState === "send" &&
        pendingAttachments.some(
          (item) => item.status === "uploading" || item.status === "error",
        )) ||
      (buttonState === "send" && !editor?.getText().trim() && pendingAttachments.length === 0);
    const isAttachmentButtonDisabled = disabled || !isConnected || buttonState !== "send";

    return (
      <div className={`message-input-container ${className}`}>
        <style>{messageInputEditorStyles}</style>
        <div className="tiptap-editor-wrapper">
          <ToolConfirmationRequest taskId={currentTaskId || ""} className="mb-4" />
          <AttachmentList
            attachments={pendingAttachments}
            onPreview={(attachment) => {
              if (attachment.kind === "image" && attachment.previewUrl) {
                setPreviewImage({ url: attachment.previewUrl, name: attachment.name });
              }
            }}
            onRemove={handleRemoveAttachment}
          />
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

        {bottomAccessory && (
          <div className="mx-auto flex w-full max-w-[800px] justify-start mt-2 px-2">
            {bottomAccessory}
          </div>
        )}

        <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
      </div>
    );
  },
);

MessageInputImpl.displayName = "MessageInput";
