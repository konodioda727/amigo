import { createSign } from "node:crypto";
import { logger } from "@/utils/logger";

const GITHUB_TOKEN_ENV_KEYS = ["GITHUB_TOKEN", "GH_TOKEN"] as const;
const DEFAULT_GITHUB_API_VERSION = "2022-11-28";
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

interface GithubAppConfig {
  appId: string;
  privateKey: string;
  installationId?: string;
}

interface CachedAccessToken {
  token: string;
  expiresAtMs: number;
}

export interface GithubRepoReference {
  host: string;
  owner: string;
  repo: string;
  canonicalHttpsUrl: string;
  apiBaseUrl: string;
}

export interface GithubGitAuth {
  token: string;
  repoUrl: string;
  host: string;
}

const installationTokenCache = new Map<string, CachedAccessToken>();
const installationIdCache = new Map<string, string>();

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\r\n/g, "\n").replace(/\\n/g, "\n").trim();
}

function resolveGithubApiBaseUrl(host: string): string {
  const configured = process.env.GITHUB_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/g, "");
  }
  return host === "github.com" ? "https://api.github.com" : `https://${host}/api/v3`;
}

function getGithubAppConfig(): GithubAppConfig | null {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY || "");
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID?.trim();

  if (!appId || !privateKey) {
    return null;
  }

  return {
    appId,
    privateKey,
    installationId: installationId || undefined,
  };
}

function createGithubAppJwt(config: GithubAppConfig): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: nowSeconds - 60,
      exp: nowSeconds + 9 * 60,
      iss: config.appId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).end().sign(config.privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function getGithubRequestHeaders(jwt: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${jwt}`,
    "User-Agent": "amigo-github-app",
    "X-GitHub-Api-Version": DEFAULT_GITHUB_API_VERSION,
  };
}

async function readGithubJson<T>(url: string, init: RequestInit, errorLabel: string): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(
      `${errorLabel} failed (${response.status}): ${responseText.trim() || response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

async function resolveInstallationId(
  config: GithubAppConfig,
  repo: GithubRepoReference,
): Promise<string> {
  if (config.installationId) {
    return config.installationId;
  }

  const cacheKey = `${repo.apiBaseUrl}::${repo.owner}/${repo.repo}`;
  const cachedInstallationId = installationIdCache.get(cacheKey);
  if (cachedInstallationId) {
    return cachedInstallationId;
  }

  const jwt = createGithubAppJwt(config);
  const installation = await readGithubJson<{ id?: number | string }>(
    `${repo.apiBaseUrl}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/installation`,
    {
      headers: getGithubRequestHeaders(jwt),
    },
    "resolve installation",
  );
  const installationId = `${installation.id || ""}`.trim();
  if (!installationId) {
    throw new Error("resolve installation failed: empty installation id");
  }
  installationIdCache.set(cacheKey, installationId);
  return installationId;
}

async function fetchInstallationAccessToken(
  config: GithubAppConfig,
  repo: GithubRepoReference,
  installationId: string,
): Promise<CachedAccessToken> {
  const jwt = createGithubAppJwt(config);
  const tokenResponse = await readGithubJson<{ token?: string; expires_at?: string }>(
    `${repo.apiBaseUrl}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: getGithubRequestHeaders(jwt),
    },
    "create installation token",
  );
  const token = tokenResponse.token?.trim();
  if (!token) {
    throw new Error("create installation token failed: empty token");
  }
  const expiresAtMs = tokenResponse.expires_at
    ? Date.parse(tokenResponse.expires_at)
    : Date.now() + 55 * 60 * 1000;
  return {
    token,
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + 55 * 60 * 1000,
  };
}

export function getDirectGithubTokenFromEnv(): string | null {
  for (const key of GITHUB_TOKEN_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export function parseGithubRepoReference(repoUrl: string): GithubRepoReference | null {
  const normalized = repoUrl.trim();
  if (!normalized) {
    return null;
  }

  const buildReference = (host: string, owner: string, repo: string): GithubRepoReference => ({
    host,
    owner,
    repo,
    canonicalHttpsUrl: `https://${host}/${owner}/${repo}.git`,
    apiBaseUrl: resolveGithubApiBaseUrl(host),
  });

  const sshMatch = normalized.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    const [, host, owner, repo] = sshMatch;
    if (!host || !owner || !repo) {
      return null;
    }
    return buildReference(host, owner, repo);
  }

  try {
    const parsed = new URL(normalized);
    if (!["https:", "http:", "ssh:"].includes(parsed.protocol)) {
      return null;
    }
    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length < 2) {
      return null;
    }
    const owner = segments[0];
    const repo = segments[1]?.replace(/\.git$/i, "");
    if (!owner || !repo) {
      return null;
    }
    return buildReference(parsed.hostname, owner, repo);
  } catch {
    return null;
  }
}

export async function resolveGithubAppAccessToken(repoUrl?: string): Promise<string | null> {
  const repo = repoUrl ? parseGithubRepoReference(repoUrl) : null;
  if (!repo) {
    return null;
  }

  const config = getGithubAppConfig();
  if (!config) {
    return null;
  }

  try {
    const installationId = await resolveInstallationId(config, repo);
    const cacheKey = `${repo.apiBaseUrl}::${installationId}`;
    const cached = installationTokenCache.get(cacheKey);
    if (cached && cached.expiresAtMs - Date.now() > ACCESS_TOKEN_REFRESH_SKEW_MS) {
      return cached.token;
    }

    const resolved = await fetchInstallationAccessToken(config, repo, installationId);
    installationTokenCache.set(cacheKey, resolved);
    return resolved.token;
  } catch (error) {
    logger.warn(
      `[githubApp] repo=${repo.owner}/${repo.repo} access token unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function resolveGithubAccessToken(repoUrl?: string): Promise<string | null> {
  const directToken = getDirectGithubTokenFromEnv();
  if (directToken) {
    return directToken;
  }
  return resolveGithubAppAccessToken(repoUrl);
}

export async function resolveGithubGitAuth(repoUrl?: string): Promise<GithubGitAuth | null> {
  const repo = repoUrl ? parseGithubRepoReference(repoUrl) : null;
  if (!repo) {
    return null;
  }

  const token = await resolveGithubAccessToken(repoUrl);
  if (!token) {
    return null;
  }

  return {
    token,
    repoUrl: repo.canonicalHttpsUrl,
    host: repo.host,
  };
}

export function clearGithubAppTokenCache(): void {
  installationTokenCache.clear();
  installationIdCache.clear();
}
