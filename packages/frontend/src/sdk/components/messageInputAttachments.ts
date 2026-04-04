import type { UserMessageAttachment } from "@amigo-llm/types";
import { getHttpBaseUrlFromWebSocketUrl } from "../../utils/sandboxEditor";

export type AttachmentUploadStatus = "uploading" | "uploaded" | "error";

export type InputAttachment = {
  id: string;
  file?: File;
  name: string;
  mimeType: string;
  size: number;
  kind: UserMessageAttachment["kind"];
  status: AttachmentUploadStatus;
  progress: number;
  url?: string;
  objectKey?: string;
  previewUrl?: string;
  error?: string;
};

type OssPolicyResponse = {
  provider: "aliyun-oss";
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresAt: string;
  formFields: Record<string, string>;
};

export type AttachmentSelectionNotice = {
  level: "warning" | "error";
  message: string;
};

const MAX_ATTACHMENT_COUNT = 8;
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 50 * 1024 * 1024;

const createAttachmentId = (): string => {
  if (globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const getAttachmentKind = (file: File): UserMessageAttachment["kind"] => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
};

const isImageFile = (file: File): boolean => file.type.startsWith("image/");

const dedupeFiles = (files: File[]): File[] => {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const extractImageFilesFromDataTransfer = (
  dataTransfer: Pick<DataTransfer, "files" | "items"> | null | undefined,
): File[] => {
  if (!dataTransfer) {
    return [];
  }

  const itemFiles = Array.from(dataTransfer.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);

  if (itemFiles.length > 0) {
    return dedupeFiles(itemFiles);
  }

  return dedupeFiles(Array.from(dataTransfer.files || []).filter((file) => isImageFile(file)));
};

export const formatFileSize = (size: number): string => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const collectAttachmentsForUpload = (
  selectedFiles: File[],
  existingAttachments: InputAttachment[],
): {
  queuedUploads: Array<{ attachment: InputAttachment; file: File }>;
  notices: AttachmentSelectionNotice[];
} => {
  const queuedUploads: Array<{ attachment: InputAttachment; file: File }> = [];
  const notices: AttachmentSelectionNotice[] = [];
  const existingKeys = new Set(
    existingAttachments.map((item) => `${item.name}:${item.size}:${item.mimeType}`),
  );

  let totalSize = existingAttachments.reduce((sum, item) => sum + item.size, 0);
  let totalCount = existingAttachments.length;

  for (const file of selectedFiles) {
    const fileKey = `${file.name}:${file.size}:${file.type}`;
    if (existingKeys.has(fileKey)) {
      continue;
    }

    if (totalCount >= MAX_ATTACHMENT_COUNT) {
      notices.push({
        level: "warning",
        message: `最多可上传 ${MAX_ATTACHMENT_COUNT} 个附件`,
      });
      break;
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      notices.push({
        level: "error",
        message: `文件过大（>${formatFileSize(MAX_ATTACHMENT_SIZE)}）：${file.name}`,
      });
      continue;
    }

    if (totalSize + file.size > MAX_TOTAL_ATTACHMENT_SIZE) {
      notices.push({
        level: "error",
        message: `附件总大小超过 ${formatFileSize(MAX_TOTAL_ATTACHMENT_SIZE)}`,
      });
      break;
    }

    const kind = getAttachmentKind(file);
    const attachment: InputAttachment = {
      id: createAttachmentId(),
      file,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      kind,
      status: "uploading",
      progress: 0,
      previewUrl: kind === "image" ? URL.createObjectURL(file) : undefined,
    };

    queuedUploads.push({ attachment, file });
    existingKeys.add(fileKey);
    totalCount += 1;
    totalSize += file.size;
  }

  return { queuedUploads, notices };
};

export const toUploadedUserMessageAttachments = (
  attachments: InputAttachment[],
): UserMessageAttachment[] => {
  return attachments
    .filter(
      (item): item is InputAttachment & { url: string } => item.status === "uploaded" && !!item.url,
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      kind: item.kind,
      url: item.url,
    }));
};

export const requestOssPolicy = async (wsUrl: string, file: File): Promise<OssPolicyResponse> => {
  const response = await fetch(`${getHttpBaseUrlFromWebSocketUrl(wsUrl)}/api/uploads/oss/policy`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });

  if (response.status === 404 || response.status === 501) {
    throw new Error("服务器未配置 OSS 上传签名接口");
  }

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `OSS policy request failed (${response.status})`);
  }

  return (await response.json()) as OssPolicyResponse;
};

export const uploadFileToAliyunOssWithProgress = (
  policy: OssPolicyResponse,
  file: File,
  onProgress: (progress: number) => void,
) => {
  const formData = new FormData();
  Object.entries(policy.formFields).forEach(([key, value]) => {
    formData.append(key, value);
  });
  formData.append("file", file);

  let xhr: XMLHttpRequest | null = new XMLHttpRequest();

  const promise = new Promise<void>((resolve, reject) => {
    if (!xhr) {
      reject(new Error("Upload initialization failed"));
      return;
    }

    xhr.open("POST", policy.uploadUrl);
    onProgress(10);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const next = Math.max(10, Math.min(99, Math.round((event.loaded / event.total) * 100)));
      onProgress(next);
    };

    xhr.onerror = () => {
      reject(new Error("OSS upload failed (network error)"));
    };

    xhr.onabort = () => {
      reject(new Error("UPLOAD_ABORTED"));
    };

    xhr.onload = () => {
      const status = xhr?.status || 0;
      if (status >= 200 && status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      reject(new Error((xhr?.responseText || "").trim() || `OSS upload failed (${status})`));
    };

    xhr.send(formData);
  }).finally(() => {
    xhr = null;
  });

  return {
    promise,
    abort: () => xhr?.abort(),
  };
};

export const deleteOssObjectViaServer = async (wsUrl: string, objectKey: string): Promise<void> => {
  const response = await fetch(`${getHttpBaseUrlFromWebSocketUrl(wsUrl)}/api/uploads/oss/delete`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ objectKey }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `OSS delete request failed (${response.status})`);
  }
};
