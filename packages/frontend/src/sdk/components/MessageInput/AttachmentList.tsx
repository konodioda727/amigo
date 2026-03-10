import type { UserMessageAttachment } from "@amigo-llm/types";
import { FileText, Image as ImageIcon, Loader2, Music, Video, X } from "lucide-react";
import type { FC } from "react";
import { formatFileSize, type InputAttachment } from "../messageInputAttachments";

type AttachmentListProps = {
  attachments: InputAttachment[];
  onPreview: (attachment: InputAttachment) => void;
  onRemove: (attachmentId: string) => void;
};

const getAttachmentIcon = (kind: UserMessageAttachment["kind"]) => {
  if (kind === "image") {
    return <ImageIcon className="w-3.5 h-3.5" />;
  }
  if (kind === "video") {
    return <Video className="w-3.5 h-3.5" />;
  }
  if (kind === "audio") {
    return <Music className="w-3.5 h-3.5" />;
  }
  return <FileText className="w-3.5 h-3.5" />;
};

export const AttachmentList: FC<AttachmentListProps> = ({ attachments, onPreview, onRemove }) => {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="attachment-list">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="attachment-chip" title={attachment.mimeType}>
          <button
            type="button"
            className={`attachment-chip-main ${
              attachment.kind === "image" && attachment.previewUrl ? "is-clickable" : ""
            }`}
            onClick={() => onPreview(attachment)}
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
            onClick={() => onRemove(attachment.id)}
            aria-label={`Remove ${attachment.name}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
