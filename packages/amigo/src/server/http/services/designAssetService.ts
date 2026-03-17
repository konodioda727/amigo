import {
  getStoredDesignAsset,
  readStoredDesignAssets,
  upsertStoredDesignAsset,
} from "../../appTools/designDocTools/designAssets";

export const listDesignAssets = (taskId: string) => {
  const assets = readStoredDesignAssets(taskId).map((asset) => ({
    id: asset.id,
    type: asset.type,
    name: asset.name,
    description: asset.description,
    tags: asset.tags,
    updatedAt: asset.updatedAt,
    thumbnailUrl: asset.thumbnailUrl,
    ...(asset.type === "image"
      ? {
          url: asset.url,
          width: asset.width,
          height: asset.height,
        }
      : {}),
  }));

  return {
    success: true,
    taskId,
    assets,
  };
};

export const getDesignAssetDetail = (taskId: string, assetId: string) => {
  const asset = getStoredDesignAsset(taskId, assetId);
  return {
    success: true,
    taskId,
    asset: asset || null,
  };
};

export const saveDesignAsset = (
  taskId: string,
  input:
    | {
        type: "component";
        id: string;
        name?: string;
        description?: string | null;
        tags?: string[];
        markupText: string;
        thumbnailUrl?: string | null;
      }
    | {
        type: "image";
        id: string;
        name?: string;
        description?: string | null;
        tags?: string[];
        url: string;
        thumbnailUrl?: string | null;
        width?: number | null;
        height?: number | null;
      },
) => {
  const asset = upsertStoredDesignAsset(taskId, input);
  return {
    success: true,
    taskId,
    asset,
  };
};
