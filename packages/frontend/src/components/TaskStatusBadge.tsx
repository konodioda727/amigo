import { AlertCircle, CheckCircle, Clock, Loader } from "lucide-react";
import type React from "react";

export type TaskStatus = "pending" | "in-progress" | "completed" | "error";

interface TaskStatusBadgeProps {
  status: TaskStatus;
  text?: string;
  className?: string;
}

/**
 * 任务状态徽章组件
 *
 * 设计规范：
 * - 高度: 24px
 * - 圆角: 8px (--radius-md)
 * - 内边距: 4px 8px (--spacing-1 --spacing-2)
 * - 字体大小: 10px (--font-size-xs)
 * - 图标大小: 12px
 *
 * 四种状态：
 * - pending (等待中): 橙色, Clock 图标
 * - in-progress (进行中): 蓝色, Loader 图标 (旋转)
 * - completed (已完成): 绿色, CheckCircle 图标
 * - error (错误): 红色, AlertCircle 图标
 */
const TaskStatusBadge: React.FC<TaskStatusBadgeProps> = ({ status, text, className = "" }) => {
  const getStatusConfig = () => {
    switch (status) {
      case "pending":
        return {
          badgeClass: "badge-warning",
          icon: <Clock className="h-3 w-3" />,
          defaultText: "等待中",
        };
      case "in-progress":
        return {
          badgeClass: "badge-info",
          icon: <Loader className="h-3 w-3 animate-spin" />,
          defaultText: "进行中",
        };
      case "completed":
        return {
          badgeClass: "badge-success",
          icon: <CheckCircle className="h-3 w-3" />,
          defaultText: "已完成",
        };
      case "error":
        return {
          badgeClass: "badge-error",
          icon: <AlertCircle className="h-3 w-3" />,
          defaultText: "错误",
        };
      default:
        return {
          badgeClass: "badge-neutral",
          icon: <Clock className="h-3 w-3" />,
          defaultText: "未知",
        };
    }
  };

  const config = getStatusConfig();
  const displayText = text || config.defaultText;

  return (
    <span className={`badge badge-sm ${config.badgeClass} gap-1 px-2 ${className}`}>
      {config.icon}
      {displayText}
    </span>
  );
};

export default TaskStatusBadge;
