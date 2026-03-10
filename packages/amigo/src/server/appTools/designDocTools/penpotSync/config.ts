import { getConfiguredPenpotConfig } from "../../../config/runtimeConfig";
import { getPenpotBaseUrl } from "../penpotBindings";
import type { PenpotSyncConfig } from "./types";

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

export const readPenpotSyncConfig = (): PenpotSyncConfig => {
  const configured = getConfiguredPenpotConfig();
  return {
    baseUrl: normalizeBaseUrl(
      configured?.baseUrl || process.env.PENPOT_BASE_URL || getPenpotBaseUrl(),
    ),
    accessToken: (configured?.accessToken || process.env.PENPOT_ACCESS_TOKEN || "").trim(),
    teamId: (configured?.teamId || process.env.PENPOT_TEAM_ID || "").trim(),
    projectId: (configured?.projectId || process.env.PENPOT_PROJECT_ID || "").trim(),
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
    throw new Error(
      "缺少 Penpot access token，请通过 createAmigoApp({ penpotConfig }) 或环境变量 PENPOT_ACCESS_TOKEN 配置",
    );
  }
};

export const ensurePenpotWriteAccess = (config: PenpotSyncConfig) => {
  ensurePenpotReadAccess(config);
  if (!config.teamId || !config.projectId) {
    throw new Error(
      "缺少 Penpot teamId 或 projectId，请通过 createAmigoApp({ penpotConfig }) 或环境变量 PENPOT_TEAM_ID / PENPOT_PROJECT_ID 配置",
    );
  }
};
