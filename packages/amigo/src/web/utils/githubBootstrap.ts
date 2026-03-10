import { getHttpBaseUrlFromWebSocketUrl } from "./sandboxEditor";

export interface GithubBootstrapSummary {
  success: boolean;
  repoUrl: string;
  repoName: string;
  branch: string;
  defaultBranch: string;
  commitSha: string;
  updatedAt: string;
}

export const bootstrapGithubRepo = async (
  wsUrl: string,
  payload: { repoUrl: string; branch?: string },
): Promise<GithubBootstrapSummary> => {
  const response = await fetch(`${getHttpBaseUrlFromWebSocketUrl(wsUrl)}/api/bootstrap/github`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as
    | GithubBootstrapSummary
    | { error?: string }
    | null;
  if (!response.ok || !data || !("repoUrl" in data)) {
    throw new Error(data && "error" in data ? data.error || "预热失败" : "预热失败");
  }

  return data;
};
export const cancelGithubBootstrap = async (
  wsUrl: string,
  payload: { repoUrl: string; branch?: string },
): Promise<void> => {
  const response = await fetch(`${getHttpBaseUrlFromWebSocketUrl(wsUrl)}/api/bootstrap/github`, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return;
  }

  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(data?.error || "取消预热失败");
};
