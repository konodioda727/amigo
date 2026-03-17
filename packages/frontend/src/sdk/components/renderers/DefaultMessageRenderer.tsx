import { Check, Copy } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import type { CommonMessageRendererProps } from "../../types/renderers";
import { prepareStreamdownContent } from "./streamdownContent";

/**
 * Default renderer for common message type
 */
export const DefaultMessageRenderer: React.FC<CommonMessageRendererProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const messageContent = prepareStreamdownContent(message.message);

  const handleCopy = () => {
    if (message.message) {
      navigator.clipboard.writeText(message.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="chat chat-start group">
      <div className="chat-bubble bg-[#f7f7f7] border border-[#ececec] text-neutral-900 rounded-xl px-4 py-3 shadow-none max-w-[85%] break-words overflow-hidden">
        <Streamdown>{messageContent}</Streamdown>
      </div>
      <div className="chat-footer opacity-50 mt-1 flex gap-2 items-center min-h-[24px]">
        {message.updateTime && <span>{new Date(message.updateTime).toLocaleTimeString()}</span>}
        {message.message && (
          <button
            onClick={handleCopy}
            className="p-1 rounded-md hover:bg-black/5 text-neutral-500 opacity-0 group-hover:opacity-100 transition-all duration-200"
            title="复制"
            aria-label="复制消息"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};
