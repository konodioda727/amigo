import { MessageInput, useTasks, useWebSocketContext } from "@amigo-llm/frontend";
import { Github, Loader2, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { cancelGithubBootstrap, type GithubBootstrapSummary } from "@/utils/githubBootstrap";
import {
  clearPendingBootstrap,
  getPendingBootstrap,
  subscribePendingBootstrap,
} from "@/utils/pendingBootstrap";
import { toast } from "@/utils/toast";
import { GithubBootstrapModal } from "./GithubBootstrapModal";

interface AppMessageComposerProps {
  taskId?: string;
}

export const AppMessageComposer: React.FC<AppMessageComposerProps> = ({ taskId }) => {
  const { config } = useWebSocketContext();
  const { mainTaskId } = useTasks();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingBootstrap, setPendingBootstrapState] = useState<GithubBootstrapSummary | null>(
    () => (typeof window === "undefined" ? null : getPendingBootstrap()),
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const effectiveTaskId = taskId || mainTaskId;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    return subscribePendingBootstrap(() => {
      setPendingBootstrapState(getPendingBootstrap());
    });
  }, []);

  const handleCancelBootstrap = async () => {
    if (!pendingBootstrap) {
      return;
    }

    setIsCancelling(true);
    try {
      await cancelGithubBootstrap(config.url, {
        repoUrl: pendingBootstrap.repoUrl,
        branch: pendingBootstrap.branch,
      });
      clearPendingBootstrap();
      toast.success("已取消当前仓库预热");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="w-full">
      <MessageInput
        taskId={taskId}
        createTaskContext={!effectiveTaskId && pendingBootstrap ? pendingBootstrap : undefined}
        onSend={() => {
          if (!effectiveTaskId && pendingBootstrap) {
            clearPendingBootstrap();
          }
        }}
      />

      {!effectiveTaskId && (
        <div className="mx-auto mt-0 flex w-full max-w-[800px] justify-start px-12">
          {pendingBootstrap ? (
            <div className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-gray-500 transition-colors hover:bg-gray-100/80 hover:text-gray-800">
              <Github className="h-3.5 w-3.5" />
              <span className="max-w-[300px] truncate" title={pendingBootstrap.repoUrl}>
                {pendingBootstrap.repoUrl.replace("https://github.com/", "").replace(".git", "")}
              </span>
              <button
                type="button"
                onClick={() => void handleCancelBootstrap()}
                disabled={isCancelling}
                className="ml-0.5 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50"
                title="取消当前仓库"
              >
                {isCancelling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-gray-400 transition-colors hover:bg-gray-100/80 hover:text-gray-800"
            >
              <Github className="h-3.5 w-3.5" />
              <span>添加 GitHub 仓库</span>
            </button>
          )}
        </div>
      )}

      <GithubBootstrapModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};
