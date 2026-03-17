import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineTool, getTaskStoragePath, logger } from "@amigo-llm/backend";
import { resolveDesignDocOwnerTaskId } from "./designDocScope";
import { validateDesignComponentAssetMarkup } from "./designMarkupCompiler";

const DESIGN_ASSETS_DIRNAME = "designAssets";
const DESIGN_ASSETS_FILENAME = "assets.json";
const LUCIDE_STATIC_VERSION = "0.544.0";
const LUCIDE_ICON_BASE_URL = `https://cdn.jsdelivr.net/npm/lucide-static@${LUCIDE_STATIC_VERSION}/icons`;

interface StoredDesignAssetBase {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StoredDesignImageAsset extends StoredDesignAssetBase {
  type: "image";
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface StoredDesignComponentAsset extends StoredDesignAssetBase {
  type: "component";
  markupText: string;
  thumbnailUrl: string | null;
}

export type StoredDesignAsset = StoredDesignImageAsset | StoredDesignComponentAsset;

const BUILTIN_ICON_ASSETS: StoredDesignImageAsset[] = [
  {
    id: "icon/search",
    type: "image",
    name: "搜索图标",
    description: "内置 Lucide 搜索图标，可直接用于搜索框、导航或工具栏。",
    tags: ["icon", "lucide", "search"],
    url: `${LUCIDE_ICON_BASE_URL}/search.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/search.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/home",
    type: "image",
    name: "首页图标",
    description: "内置 Lucide 首页图标。",
    tags: ["icon", "lucide", "home"],
    url: `${LUCIDE_ICON_BASE_URL}/house.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/house.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/user",
    type: "image",
    name: "用户图标",
    description: "内置 Lucide 用户头像图标。",
    tags: ["icon", "lucide", "user"],
    url: `${LUCIDE_ICON_BASE_URL}/user-round.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/user-round.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/menu",
    type: "image",
    name: "菜单图标",
    description: "内置 Lucide 菜单图标。",
    tags: ["icon", "lucide", "menu"],
    url: `${LUCIDE_ICON_BASE_URL}/menu.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/menu.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/cart",
    type: "image",
    name: "购物车图标",
    description: "内置 Lucide 购物车图标。",
    tags: ["icon", "lucide", "cart"],
    url: `${LUCIDE_ICON_BASE_URL}/shopping-cart.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/shopping-cart.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/heart",
    type: "image",
    name: "收藏图标",
    description: "内置 Lucide 收藏/喜欢图标。",
    tags: ["icon", "lucide", "heart"],
    url: `${LUCIDE_ICON_BASE_URL}/heart.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/heart.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/star",
    type: "image",
    name: "星标图标",
    description: "内置 Lucide 星标图标。",
    tags: ["icon", "lucide", "star"],
    url: `${LUCIDE_ICON_BASE_URL}/star.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/star.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/message",
    type: "image",
    name: "消息图标",
    description: "内置 Lucide 消息/评论图标。",
    tags: ["icon", "lucide", "message"],
    url: `${LUCIDE_ICON_BASE_URL}/message-circle.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/message-circle.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/music",
    type: "image",
    name: "音乐图标",
    description: "内置 Lucide 音乐图标。",
    tags: ["icon", "lucide", "music"],
    url: `${LUCIDE_ICON_BASE_URL}/music.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/music.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/settings",
    type: "image",
    name: "设置图标",
    description: "内置 Lucide 设置图标。",
    tags: ["icon", "lucide", "settings"],
    url: `${LUCIDE_ICON_BASE_URL}/settings.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/settings.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/arrow-right",
    type: "image",
    name: "向右箭头图标",
    description: "内置 Lucide 向右箭头图标。",
    tags: ["icon", "lucide", "arrow", "right"],
    url: `${LUCIDE_ICON_BASE_URL}/arrow-right.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/arrow-right.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/share",
    type: "image",
    name: "分享图标",
    description: "内置 Lucide 分享图标。",
    tags: ["icon", "lucide", "share"],
    url: `${LUCIDE_ICON_BASE_URL}/share-2.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/share-2.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/share-2",
    type: "image",
    name: "分享图标 2",
    description: "内置 Lucide 分享图标。",
    tags: ["icon", "lucide", "share"],
    url: `${LUCIDE_ICON_BASE_URL}/share-2.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/share-2.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/chevron-right",
    type: "image",
    name: "向右折线箭头图标",
    description: "内置 Lucide 向右折线箭头图标。",
    tags: ["icon", "lucide", "chevron", "right"],
    url: `${LUCIDE_ICON_BASE_URL}/chevron-right.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/chevron-right.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "icon/plus",
    type: "image",
    name: "加号图标",
    description: "内置 Lucide 加号图标。",
    tags: ["icon", "lucide", "plus"],
    url: `${LUCIDE_ICON_BASE_URL}/plus.svg`,
    thumbnailUrl: `${LUCIDE_ICON_BASE_URL}/plus.svg`,
    width: 24,
    height: 24,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
];

const ensureDirectoryExists = (directory: string) => {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeAssetId = (value: string) =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");

const normalizeTags = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 20)
    : [];

const toNullableFiniteNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const getDesignAssetsPath = (taskId: string) =>
  path.join(getTaskStoragePath(taskId), DESIGN_ASSETS_DIRNAME);

const getAssetsFilePath = (taskId: string) =>
  path.join(getDesignAssetsPath(taskId), DESIGN_ASSETS_FILENAME);

const parseStoredDesignAsset = (item: unknown): StoredDesignAsset | null => {
  if (!isPlainObject(item)) {
    return null;
  }

  const id = normalizeAssetId(typeof item.id === "string" ? item.id : "");
  const type = typeof item.type === "string" ? item.type : "";
  if (!id || (type !== "image" && type !== "component")) {
    return null;
  }

  const base: StoredDesignAssetBase = {
    id,
    name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : id,
    description:
      typeof item.description === "string" && item.description.trim()
        ? item.description.trim()
        : null,
    tags: normalizeTags(item.tags),
    createdAt:
      typeof item.createdAt === "string" && item.createdAt.trim()
        ? item.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof item.updatedAt === "string" && item.updatedAt.trim()
        ? item.updatedAt
        : new Date().toISOString(),
  };

  if (type === "image") {
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!isValidHttpUrl(url)) {
      return null;
    }
    const thumbnailUrl =
      typeof item.thumbnailUrl === "string" && isValidHttpUrl(item.thumbnailUrl.trim())
        ? item.thumbnailUrl.trim()
        : null;
    return {
      ...base,
      type: "image",
      url,
      thumbnailUrl,
      width: toNullableFiniteNumber(item.width),
      height: toNullableFiniteNumber(item.height),
    };
  }

  const markupText = typeof item.markupText === "string" ? item.markupText.trim() : "";
  if (!markupText) {
    return null;
  }

  return {
    ...base,
    type: "component",
    markupText,
    thumbnailUrl:
      typeof item.thumbnailUrl === "string" && isValidHttpUrl(item.thumbnailUrl.trim())
        ? item.thumbnailUrl.trim()
        : null,
  };
};

export const readStoredDesignAssets = (taskId: string): StoredDesignAsset[] => {
  const filePath = getAssetsFilePath(taskId);
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(parseStoredDesignAsset)
      .filter((item): item is StoredDesignAsset => item !== null)
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  } catch (error) {
    logger.warn("[DesignAssets] 读取设计资产失败:", filePath, error);
    return [];
  }
};

const mergeBuiltInDesignAssets = (assets: StoredDesignAsset[]) => {
  const merged = new Map<string, StoredDesignAsset>();
  for (const builtin of BUILTIN_ICON_ASSETS) {
    merged.set(builtin.id, builtin);
  }
  for (const asset of assets) {
    merged.set(asset.id, asset);
  }
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
};

export const listAvailableDesignAssets = (taskId: string) =>
  mergeBuiltInDesignAssets(readStoredDesignAssets(taskId));

export const writeStoredDesignAssets = (taskId: string, assets: StoredDesignAsset[]) => {
  const assetsPath = getDesignAssetsPath(taskId);
  ensureDirectoryExists(assetsPath);
  const filePath = getAssetsFilePath(taskId);
  writeFileSync(filePath, `${JSON.stringify(assets, null, 2)}\n`, "utf-8");
  return filePath;
};

export const readStoredDesignComponents = (taskId: string): StoredDesignComponentAsset[] =>
  listAvailableDesignAssets(taskId).filter(
    (asset): asset is StoredDesignComponentAsset => asset.type === "component",
  );

export const readStoredDesignImages = (taskId: string): StoredDesignImageAsset[] =>
  listAvailableDesignAssets(taskId).filter(
    (asset): asset is StoredDesignImageAsset => asset.type === "image",
  );

export const getStoredDesignAsset = (taskId: string, assetId: string) => {
  const normalizedId = normalizeAssetId(assetId);
  if (!normalizedId) {
    return null;
  }
  return listAvailableDesignAssets(taskId).find((item) => item.id === normalizedId) || null;
};

export const getStoredDesignComponent = (taskId: string, assetId: string) => {
  const asset = getStoredDesignAsset(taskId, assetId);
  return asset?.type === "component" ? asset : null;
};

const validateImageAssetInput = (input: {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
}) => {
  if (!isValidHttpUrl(input.url.trim())) {
    throw new Error("image 资产 url 必须是有效的 http(s) 地址");
  }
  if (
    input.thumbnailUrl &&
    input.thumbnailUrl.trim() &&
    !isValidHttpUrl(input.thumbnailUrl.trim())
  ) {
    throw new Error("image 资产 thumbnailUrl 必须是有效的 http(s) 地址");
  }
};

export const upsertStoredDesignAsset = (
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
  const id = normalizeAssetId(input.id);
  if (!id) {
    throw new Error("asset id 不能为空");
  }

  const now = new Date().toISOString();
  const assets = readStoredDesignAssets(taskId);
  const existingIndex = assets.findIndex((item) => item.id === id);
  const existing = existingIndex >= 0 ? assets[existingIndex] : null;

  let nextRecord: StoredDesignAsset;
  if (input.type === "component") {
    const markupText = input.markupText.trim();
    if (!markupText) {
      throw new Error("markupText 不能为空");
    }
    const markupErrors = validateDesignComponentAssetMarkup(markupText);
    if (markupErrors.length > 0) {
      throw new Error(`component 资产不合法: ${markupErrors[0]}`);
    }

    nextRecord = {
      id,
      type: "component",
      name: input.name?.trim() || existing?.name || id,
      description: input.description?.trim() || null,
      tags: normalizeTags(input.tags),
      markupText,
      thumbnailUrl:
        input.thumbnailUrl && isValidHttpUrl(input.thumbnailUrl.trim())
          ? input.thumbnailUrl.trim()
          : existing?.type === "component"
            ? existing.thumbnailUrl
            : null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
  } else {
    validateImageAssetInput(input);
    nextRecord = {
      id,
      type: "image",
      name: input.name?.trim() || existing?.name || id,
      description: input.description?.trim() || null,
      tags: normalizeTags(input.tags),
      url: input.url.trim(),
      thumbnailUrl:
        input.thumbnailUrl && input.thumbnailUrl.trim() ? input.thumbnailUrl.trim() : null,
      width:
        typeof input.width === "number" && Number.isFinite(input.width) && input.width > 0
          ? input.width
          : null,
      height:
        typeof input.height === "number" && Number.isFinite(input.height) && input.height > 0
          ? input.height
          : null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
  }

  if (existingIndex >= 0) {
    assets.splice(existingIndex, 1, nextRecord);
  } else {
    assets.push(nextRecord);
  }

  writeStoredDesignAssets(taskId, assets);
  return nextRecord;
};

export const upsertStoredDesignComponent = (
  taskId: string,
  input: {
    id: string;
    name?: string;
    description?: string | null;
    tags?: string[];
    markupText: string;
    thumbnailUrl?: string | null;
  },
) => upsertStoredDesignAsset(taskId, { ...input, type: "component" });

const toAssetSummary = (asset: StoredDesignAsset) => ({
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
});

export const listDesignAssetsTool = defineTool({
  name: "listDesignAssets",
  description: "列出当前任务可复用的设计资产，包括图片和 component。",
  whenToUse:
    '当需要了解当前有哪些可复用设计资产，准备在设计稿中使用 <img asset="..."> 或 <use component="..."> 引用它们时使用。',
  params: [],
  async invoke({ context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        toolResult: {
          success: false,
          assets: [],
          validationErrors: [message],
          message,
        },
      };
    }

    const assets = listAvailableDesignAssets(ownerTaskId).map(toAssetSummary);
    const message =
      assets.length > 0 ? `当前共有 ${assets.length} 个可复用设计资产` : "当前还没有任何设计资产";
    return {
      message,
      toolResult: {
        success: true,
        assets,
        validationErrors: [],
        message,
      },
    };
  },
});

export const readDesignAssetTool = defineTool({
  name: "readDesignAsset",
  description: "读取单个设计资产的详细内容，包括 image 地址或 component 的 markupText。",
  whenToUse: "当需要查看某个设计资产的完整内容，准备在设计稿中复用它时使用。",
  params: [
    {
      name: "assetId",
      optional: false,
      description: "要读取的设计资产 id",
    },
  ],
  async invoke({ params, context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        toolResult: {
          success: false,
          asset: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const assetId = typeof params.assetId === "string" ? normalizeAssetId(params.assetId) : "";
    if (!assetId) {
      const message = "assetId 不能为空";
      return {
        message,
        toolResult: {
          success: false,
          asset: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const asset = getStoredDesignAsset(ownerTaskId, assetId);
    if (!asset) {
      const message = `未找到设计资产 ${assetId}`;
      return {
        message,
        toolResult: {
          success: false,
          asset: null,
          validationErrors: [message],
          message,
        },
      };
    }

    return {
      message: `已读取设计资产: ${asset.id}`,
      toolResult: {
        success: true,
        asset,
        validationErrors: [],
        message: `已读取设计资产: ${asset.id}`,
      },
    };
  },
});
