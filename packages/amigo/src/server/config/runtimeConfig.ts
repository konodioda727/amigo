import type { OssUploadConfig } from "../utils/ossUpload";

export interface AppRuntimeConfig {
  ossUploadConfig?: OssUploadConfig | null;
}

const runtimeConfig: AppRuntimeConfig = {};

export const configureAppRuntimeConfig = (config: AppRuntimeConfig): void => {
  runtimeConfig.ossUploadConfig = config.ossUploadConfig;
};

export const getConfiguredOssUploadConfig = (): OssUploadConfig | null | undefined =>
  runtimeConfig.ossUploadConfig;
