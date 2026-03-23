import { useWebSocketContext } from "@amigo-llm/frontend";
import { Github, Loader2, X } from "lucide-react";
import type { MouseEvent } from "react";
import { useState } from "react";
import { bootstrapGithubRepo } from "@/utils/githubBootstrap";
import { setPendingBootstrap } from "@/utils/pendingBootstrap";
import { toast } from "@/utils/toast";

export interface GithubBootstrapModalProps {
  open: boolean;
  onClose: () => void;
}

export const GithubBootstrapModal: React.FC<GithubBootstrapModalProps> = ({ open, onClose }) => {
  const { config } = useWebSocketContext();
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) {
    return null;
  }

  const stopPropagation = (event: MouseEvent) => event.stopPropagation();

  const handleSubmit = async () => {
    if (!repoUrl.trim()) {
      toast.error("请先输入 GitHub 仓库链接");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await bootstrapGithubRepo(config.url, {
        repoUrl: repoUrl.trim(),
        branch: branch.trim() || undefined,
      });
      setPendingBootstrap(result);
      toast.success(
        `仓库已准备好：${result.repoName}${result.branch ? ` · ${result.branch}` : ""}`,
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="添加 GitHub 仓库"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl"
        onClick={stopPropagation}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Github className="h-4 w-4" />
              <span>添加 GitHub 仓库</span>
            </div>
            <div className="mt-1 text-xs leading-5 text-gray-500">
              先把仓库准备好。开始新对话时，Amigo 会自动把代码带进来，你可以直接继续提问或修改。
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-700">仓库链接</span>
            <input
              type="text"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-400"
              disabled={isSubmitting}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-700">分支</span>
            <input
              type="text"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder="不填则使用默认分支"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-400"
              disabled={isSubmitting}
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
            disabled={isSubmitting}
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{isSubmitting ? "准备中..." : "添加仓库"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
