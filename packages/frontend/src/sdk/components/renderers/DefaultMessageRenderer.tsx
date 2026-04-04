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
    <div className="group -mb-5 max-w-[85%] text-neutral-900">
      <div className="break-words overflow-hidden px-1">
        <Streamdown>{messageContent}</Streamdown>
      </div>
      <div className=" flex min-h-[20px] items-center gap-2 px-1 text-xs text-neutral-500">
        {message.updateTime && (
          <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-50">
            {new Date(message.updateTime).toLocaleTimeString()}
          </span>
        )}
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
