import type { PenpotSyncConfig } from "../appTools/designDocTools/penpotSync/types";
import type { OssUploadConfig } from "../utils/ossUpload";

export interface AppRuntimeConfig {
  ossUploadConfig?: OssUploadConfig | null;
  penpotConfig?: Partial<PenpotSyncConfig> | null;
}

const runtimeConfig: AppRuntimeConfig = {};

export const configureAppRuntimeConfig = (config: AppRuntimeConfig): void => {
  runtimeConfig.ossUploadConfig = config.ossUploadConfig;
  runtimeConfig.penpotConfig = config.penpotConfig;
};

export const getConfiguredOssUploadConfig = (): OssUploadConfig | null | undefined =>
  runtimeConfig.ossUploadConfig;

export const getConfiguredPenpotConfig = (): Partial<PenpotSyncConfig> | null | undefined =>
  runtimeConfig.penpotConfig;
