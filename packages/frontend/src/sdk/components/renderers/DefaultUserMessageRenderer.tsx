import { FileText, Image as ImageIcon, Loader2, Music, Video } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { UserMessageRendererProps } from "../../types/renderers";
import { ImagePreviewModal } from "../ImagePreviewModal";

/**
 * Default renderer for user message type
 */
export const DefaultUserMessageRenderer: React.FC<UserMessageRendererProps> = ({ message }) => {
  const isPending = message.status === "pending";
  const attachments = message.attachments ?? [];
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  const getAttachmentIcon = (kind: string) => {
    if (kind === "image") return <ImageIcon className="w-3.5 h-3.5" />;
    if (kind === "video") return <Video className="w-3.5 h-3.5" />;
    if (kind === "audio") return <Music className="w-3.5 h-3.5" />;
    return <FileText className="w-3.5 h-3.5" />;
  };

  return (
    <>
      <div className="chat chat-end">
        <div
          className={`
            chat-bubble 
            bg-primary text-white
            rounded-xl px-4 py-3
            shadow-none
            transition-opacity duration-200
            max-w-[85%] break-words overflow-hidden
            ${isPending ? "opacity-70" : "opacity-100"}
          `}
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((attachment) => {
                const isPreviewableImage = attachment.kind === "image" && Boolean(attachment.url);

                if (isPreviewableImage) {
                  return (
                    <button
                      key={attachment.id}
                      type="button"
                      onClick={() =>
                        setPreviewImage({ url: attachment.url, name: attachment.name })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 bg-white/15 text-white/95 text-xs hover:bg-white/25 transition-colors"
                      title={`预览图片: ${attachment.name}`}
                    >
                      {getAttachmentIcon(attachment.kind)}
                      <span className="max-w-44 truncate">{attachment.name}</span>
                    </button>
                  );
                }

                return (
                  <div
                    key={attachment.id}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 bg-white/15 text-white/95 text-xs"
                    title={`${attachment.name} (${attachment.mimeType})`}
                  >
                    {getAttachmentIcon(attachment.kind)}
                    <span className="max-w-44 truncate">{attachment.name}</span>
                  </div>
                );
              })}
            </div>
          )}
          {(message.message || attachments.length === 0) && (
            <div className="flex items-center gap-2">
              <span className="break-words whitespace-pre-wrap">{message.message}</span>
              {isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 opacity-80" />
              )}
            </div>
          )}
          {!message.message && attachments.length > 0 && isPending && (
            <div className="flex items-center justify-end">
              <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 opacity-80" />
            </div>
          )}
        </div>
        {message.updateTime && (
          <div className="chat-footer opacity-50">
            {new Date(message.updateTime).toLocaleTimeString()}
          </div>
        )}
      </div>

      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
    </>
  );
};
