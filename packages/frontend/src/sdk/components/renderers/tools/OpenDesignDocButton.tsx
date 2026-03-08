import { SquareArrowOutUpRight } from "lucide-react";
import type React from "react";
import { Link, useParams } from "react-router-dom";
import { useWebSocketContext } from "@/sdk/context/WebSocketContext";

interface OpenDesignDocButtonProps {
  pageId?: string | null;
}

export const OpenDesignDocButton: React.FC<OpenDesignDocButtonProps> = ({ pageId }) => {
  const { taskId: routeTaskId } = useParams<{ taskId: string }>();
  const { store } = useWebSocketContext();
  const mainTaskId = store((state) => state.mainTaskId);
  const taskId = routeTaskId || mainTaskId;

  if (!taskId || !pageId) {
    return null;
  }

  return (
    <Link
      to={`/${taskId}/design/${pageId}`}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      title="打开设计页"
      aria-label="打开设计页"
    >
      <SquareArrowOutUpRight className="h-3.5 w-3.5" />
    </Link>
  );
};
