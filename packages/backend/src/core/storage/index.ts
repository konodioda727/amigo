import path from "node:path";
import { getGlobalState } from "@/globalState";

export const getCacheRootPath = (): string => {
  const cachePath = getGlobalState("globalCachePath");
  return path.resolve(cachePath || path.resolve(process.cwd(), ".amigo"));
};

export const getStorageRootPath = (): string => {
  const storagePath = getGlobalState("globalStoragePath");
  return path.resolve(storagePath || path.join(getCacheRootPath(), "storage"));
};

export const getTaskStoragePath = (taskId: string): string =>
  path.join(getStorageRootPath(), taskId);
