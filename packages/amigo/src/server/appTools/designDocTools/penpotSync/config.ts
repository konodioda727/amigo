import { getPenpotBaseUrl } from "../penpotBindings";
import type { PenpotSyncConfig } from "./types";

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

export const readPenpotSyncConfig = (): PenpotSyncConfig => {
  return {
    baseUrl: normalizeBaseUrl(process.env.PENPOT_BASE_URL || getPenpotBaseUrl()),
    accessToken: (process.env.PENPOT_ACCESS_TOKEN || "").trim(),
    teamId: (process.env.PENPOT_TEAM_ID || "").trim(),
    projectId: (process.env.PENPOT_PROJECT_ID || "").trim(),
  };
};

export const callPenpotRpc = async <TResult>(
  config: PenpotSyncConfig,
  type: string,
  params: Record<string, unknown>,
): Promise<TResult> => {
  const response = await fetch(`${config.baseUrl}/api/rpc/command/${type}?_fmt=json`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Token ${config.accessToken}`,
      "content-type": "application/json",
      "x-client": "amigo",
    },
    body: JSON.stringify(params),
  });

  const data = (await response.json().catch(() => null)) as {
    hint?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok) {
    throw new Error(
      typeof data?.hint === "string"
        ? data.hint
        : typeof data?.error === "string"
          ? data.error
          : `Penpot RPC ${type} 失败 (${response.status})`,
    );
  }

  return data as TResult;
};

export const buildWorkspaceUrl = (config: PenpotSyncConfig, fileId: string, pageId: string) => {
  const url = new URL(config.baseUrl);
  const hashParams = new URLSearchParams({
    "team-id": config.teamId,
    "project-id": config.projectId,
    "file-id": fileId,
    "page-id": pageId,
  });
  url.hash = `/workspace?${hashParams.toString()}`;
  return url.toString();
};

export const ensurePenpotReadAccess = (config: PenpotSyncConfig) => {
  if (!config.accessToken) {
    throw new Error("缺少 Penpot access token，请在 .env 中配置 PENPOT_ACCESS_TOKEN");
  }
};

export const ensurePenpotWriteAccess = (config: PenpotSyncConfig) => {
  ensurePenpotReadAccess(config);
  if (!config.teamId || !config.projectId) {
    throw new Error(
      "缺少 Penpot teamId 或 projectId，请在 .env 中配置 PENPOT_TEAM_ID 和 PENPOT_PROJECT_ID",
    );
  }
};
