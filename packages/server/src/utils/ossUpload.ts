import { createHmac, randomUUID } from "node:crypto";

export interface OssUploadConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  publicBaseUrl: string;
  uploadPrefix: string;
  policyExpireSeconds: number;
  securityToken?: string;
}

export interface CreateOssPolicyInput {
  fileName: string;
  mimeType: string;
  size: number;
}

export interface OssPostPolicyResult {
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresAt: string;
  formFields: Record<string, string>;
}

const buildOssDeleteAuthHeaders = (config: OssUploadConfig, objectKey: string) => {
  const date = new Date().toUTCString();
  const canonicalizedHeaders = config.securityToken
    ? `x-oss-security-token:${config.securityToken}\n`
    : "";
  const stringToSign = `DELETE\n\n\n${date}\n${canonicalizedHeaders}/${config.bucket}/${objectKey}`;
  const signature = createHmac("sha1", config.accessKeySecret)
    .update(stringToSign)
    .digest("base64");

  const headers: Record<string, string> = {
    Date: date,
    Authorization: `OSS ${config.accessKeyId}:${signature}`,
  };
  if (config.securityToken) {
    headers["x-oss-security-token"] = config.securityToken;
  }
  return headers;
};

const encodeOssObjectKey = (objectKey: string) =>
  objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const sanitizePathSegment = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "file";

const normalizeHost = (value: string) => value.replace(/^https?:\/\//, "").replace(/\/+$/, "");

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

export const getOssUploadConfig = (): OssUploadConfig | null => {
  const endpoint = process.env.OSS_ENDPOINT;
  const bucket = process.env.OSS_BUCKET;
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;

  if (!endpoint || !bucket || !accessKeyId || !accessKeySecret) {
    return null;
  }

  const endpointHost = normalizeHost(endpoint);
  const publicBaseUrl = normalizeBaseUrl(
    process.env.OSS_PUBLIC_BASE_URL || `https://${bucket}.${endpointHost}`,
  );

  return {
    endpoint: endpointHost,
    bucket,
    accessKeyId,
    accessKeySecret,
    publicBaseUrl,
    uploadPrefix: (process.env.OSS_UPLOAD_PREFIX || "uploads").replace(/^\/+|\/+$/g, ""),
    policyExpireSeconds: Number(process.env.OSS_POLICY_EXPIRE_SECONDS || "600"),
    securityToken: process.env.OSS_SECURITY_TOKEN || undefined,
  };
};

export const createOssPostPolicy = (
  config: OssUploadConfig,
  input: CreateOssPolicyInput,
): OssPostPolicyResult => {
  const now = new Date();
  const expiresAtDate = new Date(now.getTime() + config.policyExpireSeconds * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const safeName = sanitizePathSegment(input.fileName);
  const objectKey = `${config.uploadPrefix}/${y}/${m}/${d}/${randomUUID()}-${safeName}`;

  const policyObject = {
    expiration: expiresAtDate.toISOString(),
    conditions: [
      ["eq", "$key", objectKey],
      ["eq", "$success_action_status", "200"],
      ["content-length-range", 0, Math.max(input.size, 1)],
    ],
  };

  const policy = Buffer.from(JSON.stringify(policyObject)).toString("base64");
  const signature = createHmac("sha1", config.accessKeySecret).update(policy).digest("base64");
  const uploadUrl = `https://${config.bucket}.${config.endpoint}`;
  const publicUrl = `${config.publicBaseUrl}/${objectKey}`;

  const formFields: Record<string, string> = {
    key: objectKey,
    policy,
    OSSAccessKeyId: config.accessKeyId,
    signature,
    success_action_status: "200",
  };

  if (config.securityToken) {
    formFields["x-oss-security-token"] = config.securityToken;
  }

  // Helpful for some gateways/proxies preserving content type
  if (input.mimeType) {
    formFields["Content-Type"] = input.mimeType;
  }

  return {
    uploadUrl,
    publicUrl,
    objectKey,
    expiresAt: expiresAtDate.toISOString(),
    formFields,
  };
};

export const deleteOssObject = async (
  config: OssUploadConfig,
  objectKey: string,
): Promise<void> => {
  const normalizedObjectKey = objectKey.replace(/^\/+/, "");
  if (!normalizedObjectKey) {
    throw new Error("objectKey is required");
  }

  const url = `https://${config.bucket}.${config.endpoint}/${encodeOssObjectKey(normalizedObjectKey)}`;
  const headers = buildOssDeleteAuthHeaders(config, normalizedObjectKey);
  const response = await fetch(url, {
    method: "DELETE",
    headers,
  });

  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => "");
  throw new Error(body || `OSS delete failed (${response.status})`);
};
