import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUp, Play, Plus, Square } from "lucide-react";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
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
  extractImageFilesFromDataTransfer,
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

export const resolveMessageInputButtonState = ({
  taskStatus,
  hasDraftContent,
}: {
  taskStatus: string;
  hasDraftContent: boolean;
}): "send" | "stop" | "resume" => {
  if (taskStatus === "streaming") {
    return "stop";
  }

  if (taskStatus === "interrupted" && !hasDraftContent) {
    return "resume";
  }

  return "send";
};

export const MessageInputImpl = forwardRef<MessageInputRef, MessageInputProps>(
  (
    {
      taskId,
      className = "",
      placeholder = "Type a message...",
      onSend,
      createTaskContext,
      modelConfigSnapshot,
      workflowMode,
      disabled = false,
      showMentions = true,
      bottomAccessory,
      topAccessory,
    },
    ref,
  ) => {
    const { config } = useWebSocketContext();
    const { sendMessage, sendInterrupt, sendResume, sendCreateTask } = useSendMessage();
    const { getMentionSuggestions } = useMentions();
    const { isConnected } = useConnection();
    const { mainTaskId, tasks } = useTasks();
    const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
    const [pendingAttachments, setPendingAttachments] = useState<InputAttachment[]>([]);
    const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
    const [isImageDragActive, setIsImageDragActive] = useState(false);
    const isSuggestionActiveRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const handleSendRef = useRef<() => Promise<void>>(async () => {});
    const uploadAbortMapRef = useRef<Record<string, () => void>>({});
    const pendingAttachmentsRef = useRef<InputAttachment[]>([]);

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
      pendingAttachmentsRef.current = pendingAttachments;
    }, [pendingAttachments]);

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
      pendingAttachmentsRef.current = [];
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
        sendCreateTask(content, attachments, createTaskContext, modelConfigSnapshot, workflowMode);
      } else {
        sendMessage(
          content,
          effectiveSessionId || currentTaskTargetId,
          attachments,
          modelConfigSnapshot,
          workflowMode,
        );
      }

      onSend?.(content);
      clear();
    }, [
      clear,
      createTaskContext,
      disabled,
      editor,
      mainTaskId,
      modelConfigSnapshot,
      onSend,
      pendingAttachments,
      sendCreateTask,
      sendMessage,
      targetSessionId,
      taskId,
      workflowMode,
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

    const enqueueFilesForUpload = useCallback(
      (files: File[]) => {
        if (files.length === 0) {
          return [];
        }

        const { queuedUploads, notices } = collectAttachmentsForUpload(
          files,
          pendingAttachmentsRef.current,
        );
        notices.forEach(({ level, message }) => {
          toast[level](message);
        });
        if (queuedUploads.length === 0) {
          return [];
        }

        pendingAttachmentsRef.current = [
          ...pendingAttachmentsRef.current,
          ...queuedUploads.map(({ attachment }) => attachment),
        ];
        setPendingAttachments(pendingAttachmentsRef.current);

        for (const item of queuedUploads) {
          void startAttachmentUpload(item.attachment, item.file);
        }

        return queuedUploads;
      },
      [startAttachmentUpload],
    );

    const handleFileInputChange = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files || []);
        if (selectedFiles.length === 0) {
          return;
        }

        enqueueFilesForUpload(selectedFiles);
        event.target.value = "";
      },
      [enqueueFilesForUpload],
    );

    const hasDraftContent = !!editor?.getText().trim() || pendingAttachments.length > 0;
    const buttonState = resolveMessageInputButtonState({
      taskStatus,
      hasDraftContent,
    });
    const isAttachmentInteractionEnabled = !disabled && isConnected && buttonState !== "stop";

    const handlePasteCapture = useCallback(
      (event: ClipboardEvent<HTMLDivElement>) => {
        if (!isAttachmentInteractionEnabled) {
          return;
        }

        const imageFiles = extractImageFilesFromDataTransfer(event.clipboardData);
        if (imageFiles.length === 0) {
          return;
        }

        event.preventDefault();
        if (enqueueFilesForUpload(imageFiles).length > 0) {
          editor?.commands.focus("end");
        }
      },
      [editor, enqueueFilesForUpload, isAttachmentInteractionEnabled],
    );

    const handleDragEnterCapture = useCallback(
      (event: DragEvent<HTMLDivElement>) => {
        if (!isAttachmentInteractionEnabled) {
          return;
        }
        if (extractImageFilesFromDataTransfer(event.dataTransfer).length > 0) {
          setIsImageDragActive(true);
        }
      },
      [isAttachmentInteractionEnabled],
    );

    const handleDragOverCapture = useCallback(
      (event: DragEvent<HTMLDivElement>) => {
        if (!isAttachmentInteractionEnabled) {
          return;
        }
        if (extractImageFilesFromDataTransfer(event.dataTransfer).length === 0) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsImageDragActive(true);
      },
      [isAttachmentInteractionEnabled],
    );

    const handleDragLeaveCapture = useCallback((event: DragEvent<HTMLDivElement>) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }
      setIsImageDragActive(false);
    }, []);

    const handleDropCapture = useCallback(
      (event: DragEvent<HTMLDivElement>) => {
        setIsImageDragActive(false);
        if (!isAttachmentInteractionEnabled) {
          return;
        }

        const imageFiles = extractImageFilesFromDataTransfer(event.dataTransfer);
        if (imageFiles.length === 0) {
          return;
        }

        event.preventDefault();
        if (enqueueFilesForUpload(imageFiles).length > 0) {
          editor?.commands.focus("end");
        }
      },
      [editor, enqueueFilesForUpload, isAttachmentInteractionEnabled],
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
          const nextAttachments = prev.filter((item) => item.id !== attachmentId);
          pendingAttachmentsRef.current = nextAttachments;
          return nextAttachments;
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
      sendResume(currentTaskId || undefined, modelConfigSnapshot);
    }, [currentTaskId, disabled, modelConfigSnapshot, sendResume]);

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
    const isAttachmentButtonDisabled = !isAttachmentInteractionEnabled;

    return (
      <div className={`message-input-container ${className}`}>
        <style>{messageInputEditorStyles}</style>

        <ToolConfirmationRequest
          taskId={currentTaskId || ""}
          className="mb-4 mx-auto max-w-[800px]"
        />

        <div
          className={`message-input-theme-wrapper ${isImageDragActive ? "is-image-drag-active" : ""}`}
          onPasteCapture={handlePasteCapture}
          onDragEnterCapture={handleDragEnterCapture}
          onDragOverCapture={handleDragOverCapture}
          onDragLeaveCapture={handleDragLeaveCapture}
          onDropCapture={handleDropCapture}
        >
          {topAccessory}
          <div className="tiptap-editor-wrapper">
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
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />

          <div className="flex items-center justify-between mt-1 px-2 pb-1 gap-4">
            <div className="flex items-center gap-2 flex-grow overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center justify-center shrink-0 w-8 h-8 rounded-full transition-all ${
                  isAttachmentButtonDisabled
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                }`}
                disabled={isAttachmentButtonDisabled}
                title="上传图片、视频或文件"
              >
                <Plus className="w-5 h-5" />
              </button>

              {bottomAccessory}
            </div>

            <div className="flex items-center shrink-0">
              <button
                onClick={handleClick}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 ${
                  buttonState === "stop"
                    ? "bg-red-500 hover:bg-red-600 text-white shadow-sm"
                    : buttonState === "resume"
                      ? "bg-green-500 hover:bg-green-600 text-white shadow-sm"
                      : isButtonDisabled
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-black text-white hover:bg-gray-800 shadow-sm"
                }`}
                type="button"
                disabled={isButtonDisabled}
              >
                {buttonState === "stop" && <Square className="w-3.5 h-3.5" fill="currentColor" />}
                {buttonState === "resume" && <Play className="w-3.5 h-3.5" fill="currentColor" />}
                {buttonState === "send" && <ArrowUp className="w-4 h-4" strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </div>

        <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
      </div>
    );
  },
);

MessageInputImpl.displayName = "MessageInput";
