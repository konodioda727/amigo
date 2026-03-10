import { createOssPostPolicy, deleteOssObject, getOssUploadConfig } from "../../utils/ossUpload";
import { HttpError } from "../shared/errors";

const requireOssConfig = () => {
  const config = getOssUploadConfig();
  if (!config) {
    throw new HttpError(501, "OSS_NOT_CONFIGURED", "OSS upload is not configured");
  }
  return config;
};

export const createUploadPolicy = (input: { fileName: string; mimeType: string; size: number }) => {
  const config = requireOssConfig();
  return {
    provider: "aliyun-oss",
    ...createOssPostPolicy(config, input),
  };
};

export const removeUploadObject = async (objectKey: string) => {
  const config = requireOssConfig();
  await deleteOssObject(config, objectKey);
  return { success: true };
};
