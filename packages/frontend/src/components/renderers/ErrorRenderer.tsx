import { AlertCircle } from "lucide-react";
import type React from "react";
import type { ErrorDisplayType } from "@/messages/types";

const ErrorRenderer: React.FC<ErrorDisplayType> = ({ message, updateTime }) => {
  return (
    <div className="flex justify-center w-full mb-3">
      {/* 系统消息样式 - 居中显示，类似 IM 软件的系统提示 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-error/10 rounded-lg text-error text-xs max-w-[80%]">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-label="错误" />
        <span className="whitespace-pre-wrap">{message}</span>
        {updateTime && (
          <span className="opacity-50 ml-1">
            {new Date(updateTime).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
};

export default ErrorRenderer;
