import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDrizzleDb } from "../db/drizzle";
import { isMysqlConfigured, mysqlExecute } from "../db/mysql";
import {
  authAccountsTable,
  authSessionsTable,
  authVerificationsTable,
  usersTable,
} from "../db/schema";

interface SessionUserPayload {
  id: string;
  email: string;
  name: string;
  tenantId?: string;
  kind?: string;
  status?: string;
}

interface SessionPayload {
  session: {
    id: string;
    userId: string;
    expiresAt: string;
  };
  user: SessionUserPayload;
}

const buildTrustedOrigins = (request?: Request): string[] => {
  const configured = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const requestOrigin = request ? new URL(request.url).origin : "";
  return Array.from(new Set([...configured, requestOrigin].filter(Boolean)));
};

const readAuthSecret = (): string => {
  const configured = (process.env.BETTER_AUTH_SECRET || "").trim();
  if (configured) {
    return configured;
  }
  return "amigo-dev-secret-change-me";
};

const readBaseUrl = (): string | undefined => {
  const configured = (process.env.BETTER_AUTH_BASE_URL || process.env.BETTER_AUTH_URL || "").trim();
  if (configured) {
    return configured;
  }

  const port = (process.env.AMIGO_PORT || "").trim() || "10013";
  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:${port}`;
  }

  return configured || undefined;
};

let authInstance: ReturnType<typeof betterAuth> | null = null;

export const getAmigoAuth = (): ReturnType<typeof betterAuth> => {
  if (!isMysqlConfigured()) {
    throw new Error("Better Auth requires MySQL to be configured.");
  }

  if (!authInstance) {
    authInstance = betterAuth({
      secret: readAuthSecret(),
      ...(readBaseUrl() ? { baseURL: readBaseUrl() } : {}),
      basePath: "/api/auth",
      trustedOrigins: buildTrustedOrigins,
      database: drizzleAdapter(getDrizzleDb(), {
        provider: "mysql",
        schema: {
          user: usersTable,
          session: authSessionsTable,
          account: authAccountsTable,
          verification: authVerificationsTable,
        },
      }),
      emailAndPassword: {
        enabled: true,
        autoSignIn: true,
      },
      user: {
        fields: {
          name: "displayName",
          email: "email",
          emailVerified: "emailVerified",
          image: "image",
          createdAt: "createdAt",
          updatedAt: "updatedAt",
        },
        additionalFields: {
          tenantId: {
            type: "string",
            fieldName: "tenantId",
            required: false,
            input: false,
          },
          kind: {
            type: "string",
            fieldName: "kind",
            required: false,
            input: false,
          },
          status: {
            type: "string",
            fieldName: "status",
            required: false,
            input: false,
          },
        },
      },
      session: {
        fields: {
          expiresAt: "expiresAt",
          token: "token",
          createdAt: "createdAt",
          updatedAt: "updatedAt",
          ipAddress: "ipAddress",
          userAgent: "userAgent",
          userId: "userId",
        },
      },
      account: {
        fields: {
          accountId: "accountId",
          providerId: "providerId",
          userId: "userId",
          accessToken: "accessToken",
          refreshToken: "refreshToken",
          idToken: "idToken",
          accessTokenExpiresAt: "accessTokenExpiresAt",
          refreshTokenExpiresAt: "refreshTokenExpiresAt",
          scope: "scope",
          password: "password",
          createdAt: "createdAt",
          updatedAt: "updatedAt",
        },
      },
      verification: {
        fields: {
          identifier: "identifier",
          value: "value",
          expiresAt: "expiresAt",
          createdAt: "createdAt",
          updatedAt: "updatedAt",
        },
      },
      databaseHooks: {
        user: {
          create: {
            before: async (user) => {
              const tenantId =
                typeof user.tenantId === "string" && user.tenantId.trim()
                  ? user.tenantId.trim()
                  : randomUUID();
              const tenantSlug = `user-${tenantId}`;
              const tenantName = String(user.name || user.email || tenantSlug).trim() || tenantSlug;

              await mysqlExecute("INSERT INTO tenants (id, slug, name) VALUES (?, ?, ?)", [
                tenantId,
                tenantSlug,
                tenantName,
              ]);

              return {
                data: {
                  ...user,
                  tenantId,
                  kind:
                    typeof user.kind === "string" && user.kind.trim()
                      ? user.kind.trim()
                      : "local_web",
                  status:
                    typeof user.status === "string" && user.status.trim()
                      ? user.status.trim()
                      : "active",
                },
              };
            },
          },
        },
      },
    }) as unknown as ReturnType<typeof betterAuth>;
  }

  if (!authInstance) {
    throw new Error("Failed to initialize Better Auth.");
  }

  return authInstance;
};

export const handleAuthRequest = async (req: Request): Promise<Response> => {
  return getAmigoAuth().handler(req);
};

export const getSessionFromRequest = async (req: Request): Promise<SessionPayload | null> => {
  const url = new URL(req.url);
  url.pathname = "/api/auth/get-session";
  url.search = "";

  const response = await getAmigoAuth().handler(
    new Request(url.toString(), {
      method: "GET",
      headers: req.headers,
    }),
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as SessionPayload | null;
  if (!payload?.session?.userId || !payload.user?.id) {
    return null;
  }

  return payload;
};

export const getAuthenticatedUserId = async (req: Request): Promise<string | null> => {
  const session = await getSessionFromRequest(req);
  return session?.user?.id || null;
};
