import { afterEach, describe, expect, it, mock } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { clearGithubAppTokenCache, resolveGithubAppAccessToken, resolveGithubGitAuth } from "./app";

const GITHUB_ENV_KEYS = [
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_API_BASE_URL",
] as const;

const originalEnv = Object.fromEntries(
  GITHUB_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof GITHUB_ENV_KEYS)[number], string | undefined>;
const originalFetch = globalThis.fetch;

function restoreGithubEnv(): void {
  for (const key of GITHUB_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  restoreGithubEnv();
  clearGithubAppTokenCache();
  globalThis.fetch = originalFetch;
});

describe("resolveGithubGitAuth", () => {
  it("uses the direct env token and canonical https repo url for ssh remotes", async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = "direct-token";
    const fetchSpy = mock(async () => {
      throw new Error("fetch should not be called when a direct token is configured");
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const auth = await resolveGithubGitAuth("git@github.com:acme/private-repo.git");

    expect(auth).toEqual({
      token: "direct-token",
      repoUrl: "https://github.com/acme/private-repo.git",
      host: "github.com",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("resolveGithubAppAccessToken", () => {
  it("resolves and caches installation tokens from GitHub App credentials", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.GITHUB_APP_ID = "123456";
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();

    const fetchSpy = mock(async (input: string | URL | Request) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/repos/acme/private-repo/installation")) {
        return new Response(JSON.stringify({ id: 7890 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/app/installations/7890/access_tokens")) {
        return new Response(
          JSON.stringify({
            token: "installation-token",
            expires_at: "2999-01-01T00:00:00Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const first = await resolveGithubAppAccessToken("https://github.com/acme/private-repo.git");
    const second = await resolveGithubAppAccessToken("https://github.com/acme/private-repo.git");

    expect(first).toBe("installation-token");
    expect(second).toBe("installation-token");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
