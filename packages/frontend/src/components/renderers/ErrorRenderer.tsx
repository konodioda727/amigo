import type { ErrorDisplayType } from "@/messages/types";
import { AlertTriangle } from "lucide-react";

const ErrorRenderer: React.FC<ErrorDisplayType> = ({ message, updateTime }) => {
  return (
    <div className="flex flex-col items-center w-full mb-4">
      <div className="w-full max-w-4xl">
        <div className="alert alert-error shadow-lg">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <div className="flex-1">
            <h3 className="font-bold">系统错误</h3>
            <div className="text-sm mt-2 whitespace-pre-wrap">{message}</div>
          </div>
        </div>
        <div className="text-xs opacity-50 mt-2 text-center">
          {updateTime && new Date(updateTime).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default ErrorRenderer;
