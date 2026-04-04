import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getTaskStoragePath, logger } from "@amigo-llm/backend";

export const DESIGN_FLOW_DIRNAME = "designFlow";
export const DESIGN_SESSION_FILENAME = "session.json";
export const LAYOUT_OPTIONS_DIRNAME = "layoutOptions";
export const FINAL_DRAFTS_DIRNAME = "finalDrafts";
export const MODULE_DRAFTS_DIRNAME = "modules";
export const DRAFT_ASSEMBLY_FILENAME = "assembly.json";
export const DRAFT_RENDERS_DIRNAME = "renders";
export const DRAFT_RENDER_ARTIFACT_FILENAME = "latest.json";
export const DRAFT_CRITIQUE_DIRNAME = "critique";
export const DRAFT_CRITIQUE_FILENAME = "latest.json";
export const SOURCE_FILENAME = "source.html";
export const PREVIEW_SOURCE_FILENAME = "__preview.input.css";
export const PREVIEW_HTML_FILENAME = "preview.html";
export const PREVIEW_BUILD_CACHE_DIRNAME = ".amigo-design-flow-cache";
export const TASK_PREVIEW_ROUTE_PREFIX = "/api/tasks";
export const AMIGO_PACKAGE_ROOT = path.resolve(import.meta.dir, "../../../..");
export const WORKSPACE_ROOT = path.resolve(AMIGO_PACKAGE_ROOT, "../..");

export interface DesignModule {
  id: string;
  label: string;
  summary: string;
  priority: "primary" | "secondary" | "support";
}

export interface DesignSession {
  pageGoal: string;
  targetAudience: string;
  brandMood: string;
  styleKeywords: string[];
  references: string[];
  constraints: string[];
  antiGoals: string[];
  modules: DesignModule[];
  selectedLayoutId: string | null;
  selectedThemeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutNode {
  id: string;
  label: string;
  direction?: "row" | "column";
  width?: number;
  height?: number;
  flex?: number;
  padding?: number;
  gap?: number;
  children?: LayoutNode[];
}

export interface LayoutOption {
  layoutId: string;
  title: string;
  description: string;
  source: string;
  moduleIds: string[];
  canvasWidth: number;
  canvasHeight: number;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutDraftOption {
  layoutId: string;
  title: string;
  description: string;
  source: string;
  moduleIds: string[];
  canvasWidth: number;
  canvasHeight: number;
  createdAt: string;
  updatedAt: string;
  validationErrors: string[];
}

export interface ThemeTokens {
  background: string;
  surface: string;
  surfaceAlt: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryText: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
  warning: string;
  radius: string;
  shadow: string;
}

export interface ThemeOption {
  themeId: string;
  title: string;
  description: string;
  tokens: ThemeTokens;
  createdAt: string;
  updatedAt: string;
}

export interface FinalDesignDraft {
  draftId: string;
  title: string;
  notes: string | null;
  content: string;
  basedOnLayoutId: string;
  basedOnThemeId: string;
  status: "draft" | "approved";
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleDraft {
  draftId: string;
  moduleId: string;
  title: string;
  html: string;
  notes: string | null;
  assetsUsed: string[];
  copySummary: string;
  status: "draft" | "revised" | "accepted";
  createdAt: string;
  updatedAt: string;
}

export interface DraftAssemblyRecord {
  draftId: string;
  basedOnLayoutId: string;
  basedOnThemeId: string;
  moduleOrder: string[];
  assembledHtml: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface DraftRenderArtifact {
  draftId: string;
  revision: number;
  deviceMode: "desktop" | "mobile";
  status: "disabled" | "skipped" | "captured" | "failed";
  localFilePath: string | null;
  imagePath: string | null;
  publicImageUrl: string | null;
  capturedAt: string | null;
  message: string;
}

export interface DraftCritiqueIssue {
  scope: "global" | "module";
  moduleId: string | null;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  recommendation: string;
}

export interface DraftCritique {
  draftId: string;
  revision: number;
  summary: string;
  autoFixedModuleIds: string[];
  issues: DraftCritiqueIssue[];
  createdAt: string;
}

export interface StoredDesignFlow {
  session: DesignSession | null;
  layoutOptions: LayoutOption[];
  layoutDraftOptions: LayoutDraftOption[];
  themeOptions: ThemeOption[];
}

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const ensureDirectoryExists = (directory: string) => {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
};

export const normalizeId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const normalizeCssPath = (value: string) => value.split(path.sep).join("/");

export const toCssSpecifier = (value: string) => {
  const normalized = normalizeCssPath(value);
  if (normalized.startsWith(".") || normalized.startsWith("/")) {
    return normalized;
  }
  return `./${normalized}`;
};

export const readJsonFile = <T>(filePath: string): T | null => {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch (error) {
    logger.warn("[DesignFlow] 读取 JSON 失败:", filePath, error);
    return null;
  }
};

export const getDesignFlowRootPath = (taskId: string) =>
  path.join(getTaskStoragePath(taskId), DESIGN_FLOW_DIRNAME);

export const getDesignSessionPath = (taskId: string) =>
  path.join(getDesignFlowRootPath(taskId), DESIGN_SESSION_FILENAME);

export const getFinalDraftsDirectoryPath = (taskId: string) =>
  path.join(getDesignFlowRootPath(taskId), FINAL_DRAFTS_DIRNAME);

export const getLayoutOptionsDirectoryPath = (taskId: string) =>
  path.join(getDesignFlowRootPath(taskId), LAYOUT_OPTIONS_DIRNAME);

export const getLayoutOptionDirectoryPath = (taskId: string, layoutId: string) =>
  path.join(getLayoutOptionsDirectoryPath(taskId), normalizeId(layoutId));

export const getLayoutOptionSourcePath = (taskId: string, layoutId: string) =>
  path.join(getLayoutOptionDirectoryPath(taskId, layoutId), SOURCE_FILENAME);

export const getLayoutOptionBuildDirectoryPath = (taskId: string, layoutId: string) =>
  path.join(
    AMIGO_PACKAGE_ROOT,
    PREVIEW_BUILD_CACHE_DIRNAME,
    normalizeId(taskId),
    `layout-${normalizeId(layoutId)}`,
  );

export const getLayoutOptionPreviewSourcePath = (taskId: string, layoutId: string) =>
  path.join(getLayoutOptionBuildDirectoryPath(taskId, layoutId), PREVIEW_SOURCE_FILENAME);

export const getLayoutOptionPreviewCssPath = (taskId: string, layoutId: string) =>
  getLayoutOptionPreviewSourcePath(taskId, layoutId);

export const getLayoutOptionPreviewHtmlPath = (taskId: string, layoutId: string) =>
  path.join(getLayoutOptionDirectoryPath(taskId, layoutId), PREVIEW_HTML_FILENAME);

export const getLayoutOptionPreviewPath = (taskId: string, layoutId: string) =>
  `${TASK_PREVIEW_ROUTE_PREFIX}/${encodeURIComponent(taskId)}/layout-options/${encodeURIComponent(
    normalizeId(layoutId),
  )}/preview`;

export const getFinalDraftDirectoryPath = (taskId: string, draftId: string) =>
  path.join(getFinalDraftsDirectoryPath(taskId), normalizeId(draftId));

export const getFinalDraftRecordPath = (taskId: string, draftId: string) =>
  path.join(getFinalDraftDirectoryPath(taskId, draftId), "draft.json");

export const getModuleDraftsDirectoryPath = (taskId: string, draftId: string) =>
  path.join(getFinalDraftDirectoryPath(taskId, draftId), MODULE_DRAFTS_DIRNAME);

export const getModuleDraftRecordPath = (taskId: string, draftId: string, moduleId: string) =>
  path.join(getModuleDraftsDirectoryPath(taskId, draftId), `${normalizeId(moduleId)}.json`);

export const getModuleDraftBuildDirectoryPath = (
  taskId: string,
  draftId: string,
  moduleId: string,
) =>
  path.join(
    AMIGO_PACKAGE_ROOT,
    PREVIEW_BUILD_CACHE_DIRNAME,
    normalizeId(taskId),
    normalizeId(draftId),
    `module-${normalizeId(moduleId)}`,
  );

export const getModuleDraftPreviewSourcePath = (
  taskId: string,
  draftId: string,
  moduleId: string,
) =>
  path.join(getModuleDraftBuildDirectoryPath(taskId, draftId, moduleId), PREVIEW_SOURCE_FILENAME);

export const getModuleDraftPreviewCssPath = (taskId: string, draftId: string, moduleId: string) =>
  getModuleDraftPreviewSourcePath(taskId, draftId, moduleId);

export const getModuleDraftPreviewHtmlPath = (taskId: string, draftId: string, moduleId: string) =>
  path.join(
    getModuleDraftsDirectoryPath(taskId, draftId),
    `${normalizeId(moduleId)}.${PREVIEW_HTML_FILENAME}`,
  );

export const getDraftAssemblyPath = (taskId: string, draftId: string) =>
  path.join(getFinalDraftDirectoryPath(taskId, draftId), DRAFT_ASSEMBLY_FILENAME);

export const getDraftRendersDirectoryPath = (taskId: string, draftId: string) =>
  path.join(getFinalDraftDirectoryPath(taskId, draftId), DRAFT_RENDERS_DIRNAME);

export const getDraftRenderImagePath = (taskId: string, draftId: string, revision: number) =>
  path.join(getDraftRendersDirectoryPath(taskId, draftId), `rev-${Math.max(0, revision)}.png`);

export const getDraftLatestRenderArtifactPath = (taskId: string, draftId: string) =>
  path.join(getDraftRendersDirectoryPath(taskId, draftId), DRAFT_RENDER_ARTIFACT_FILENAME);

export const getDraftCritiqueDirectoryPath = (taskId: string, draftId: string) =>
  path.join(getFinalDraftDirectoryPath(taskId, draftId), DRAFT_CRITIQUE_DIRNAME);

export const getDraftLatestCritiquePath = (taskId: string, draftId: string) =>
  path.join(getDraftCritiqueDirectoryPath(taskId, draftId), DRAFT_CRITIQUE_FILENAME);

export const getFinalDraftSourcePath = (taskId: string, draftId: string) =>
  path.join(getFinalDraftDirectoryPath(taskId, draftId), SOURCE_FILENAME);

export const getFinalDraftBuildDirectoryPath = (taskId: string, draftId: string) =>
  path.join(
    AMIGO_PACKAGE_ROOT,
    PREVIEW_BUILD_CACHE_DIRNAME,
    normalizeId(taskId),
    normalizeId(draftId),
  );

export const getFinalDraftPreviewSourcePath = (taskId: string, draftId: string) =>
  path.join(getFinalDraftBuildDirectoryPath(taskId, draftId), PREVIEW_SOURCE_FILENAME);

export const getFinalDraftPreviewCssPath = (taskId: string, draftId: string) =>
  getFinalDraftPreviewSourcePath(taskId, draftId);

export const getFinalDraftPreviewHtmlPath = (taskId: string, draftId: string) =>
  path.join(getFinalDraftDirectoryPath(taskId, draftId), PREVIEW_HTML_FILENAME);

export const getFinalDesignDraftPreviewPath = (taskId: string, draftId: string) =>
  `${TASK_PREVIEW_ROUTE_PREFIX}/${encodeURIComponent(taskId)}/final-design-drafts/${encodeURIComponent(
    draftId,
  )}/preview`;

export const getFinalDesignDraftRenderImageHttpPath = (taskId: string, draftId: string) =>
  `${TASK_PREVIEW_ROUTE_PREFIX}/${encodeURIComponent(taskId)}/final-design-drafts/${encodeURIComponent(
    draftId,
  )}/render.png`;

export const getFinalDesignDraftCritiqueHttpPath = (taskId: string, draftId: string) =>
  `${TASK_PREVIEW_ROUTE_PREFIX}/${encodeURIComponent(taskId)}/final-design-drafts/${encodeURIComponent(
    draftId,
  )}/critique`;

export const getModuleDraftPreviewPath = (taskId: string, draftId: string, moduleId: string) =>
  `${TASK_PREVIEW_ROUTE_PREFIX}/${encodeURIComponent(taskId)}/final-design-drafts/${encodeURIComponent(
    normalizeId(draftId),
  )}/modules/${encodeURIComponent(normalizeId(moduleId))}/preview`;

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];

export const parseDesignModules = (value: unknown): DesignModule[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (!isPlainObject(item)) {
            return null;
          }
          const id = typeof item.id === "string" ? normalizeId(item.id) : "";
          const label = typeof item.label === "string" ? item.label.trim() : "";
          const summary = typeof item.summary === "string" ? item.summary.trim() : "";
          const priority =
            item.priority === "primary" ||
            item.priority === "secondary" ||
            item.priority === "support"
              ? item.priority
              : "secondary";
          return id && label ? { id, label, summary, priority } : null;
        })
        .filter((item): item is DesignModule => Boolean(item))
    : [];

export const parseLayoutNode = (value: unknown): LayoutNode | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? normalizeId(value.id) : "";
  const label = typeof value.label === "string" ? value.label.trim() : "";
  if (!id || !label) {
    return null;
  }

  return {
    id,
    label,
    direction:
      value.direction === "row" || value.direction === "column" ? value.direction : "column",
    width: typeof value.width === "number" ? value.width : undefined,
    height: typeof value.height === "number" ? value.height : undefined,
    flex: typeof value.flex === "number" ? value.flex : undefined,
    padding: typeof value.padding === "number" ? value.padding : undefined,
    gap: typeof value.gap === "number" ? value.gap : undefined,
    children: Array.isArray(value.children)
      ? value.children.map(parseLayoutNode).filter((child): child is LayoutNode => Boolean(child))
      : [],
  };
};

export const parseThemeTokens = (value: unknown): ThemeTokens | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  const read = (key: keyof ThemeTokens) =>
    typeof value[key] === "string" ? value[key].trim() : "";
  const tokens: ThemeTokens = {
    background: read("background"),
    surface: read("surface"),
    surfaceAlt: read("surfaceAlt"),
    textPrimary: read("textPrimary"),
    textSecondary: read("textSecondary"),
    border: read("border"),
    primary: read("primary"),
    primaryText: read("primaryText"),
    accent: read("accent"),
    accentText: read("accentText"),
    danger: read("danger"),
    success: read("success"),
    warning: read("warning"),
    radius: read("radius"),
    shadow: read("shadow"),
  };

  return Object.values(tokens).every(Boolean) ? tokens : null;
};

export const parseDesignSession = (value: unknown): DesignSession | null => {
  if (!isPlainObject(value) || typeof value.pageGoal !== "string") {
    return null;
  }

  return {
    pageGoal: value.pageGoal.trim(),
    targetAudience: typeof value.targetAudience === "string" ? value.targetAudience.trim() : "",
    brandMood: typeof value.brandMood === "string" ? value.brandMood.trim() : "",
    styleKeywords: normalizeStringArray(value.styleKeywords),
    references: normalizeStringArray(value.references),
    constraints: normalizeStringArray(value.constraints),
    antiGoals: normalizeStringArray(value.antiGoals),
    modules: parseDesignModules(value.modules),
    selectedLayoutId:
      typeof value.selectedLayoutId === "string" && value.selectedLayoutId.trim()
        ? normalizeId(value.selectedLayoutId)
        : null,
    selectedThemeId:
      typeof value.selectedThemeId === "string" && value.selectedThemeId.trim()
        ? normalizeId(value.selectedThemeId)
        : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
};

export const parseLayoutOptions = (value: unknown): LayoutOption[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (!isPlainObject(item)) {
            return null;
          }
          const layoutId = typeof item.layoutId === "string" ? normalizeId(item.layoutId) : "";
          const title = typeof item.title === "string" ? item.title.trim() : "";
          const description = typeof item.description === "string" ? item.description.trim() : "";
          const source = typeof item.source === "string" ? item.source : "";
          if (!layoutId || !title || !source.trim()) {
            return null;
          }

          return {
            layoutId,
            title,
            description,
            source,
            moduleIds: normalizeStringArray(item.moduleIds).map((moduleId) =>
              normalizeId(moduleId),
            ),
            canvasWidth: typeof item.canvasWidth === "number" ? item.canvasWidth : 1440,
            canvasHeight: typeof item.canvasHeight === "number" ? item.canvasHeight : 1024,
            createdAt:
              typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString(),
            updatedAt:
              typeof item.updatedAt === "string" ? item.updatedAt : new Date(0).toISOString(),
          };
        })
        .filter((item): item is LayoutOption => Boolean(item))
    : [];

export const parseLayoutDraftOptions = (value: unknown): LayoutDraftOption[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (!isPlainObject(item)) {
            return null;
          }
          const layoutId = typeof item.layoutId === "string" ? normalizeId(item.layoutId) : "";
          const title = typeof item.title === "string" ? item.title.trim() : "";
          const description = typeof item.description === "string" ? item.description.trim() : "";
          const source = typeof item.source === "string" ? item.source : "";
          if (!layoutId) {
            return null;
          }

          return {
            layoutId,
            title,
            description,
            source,
            moduleIds: normalizeStringArray(item.moduleIds).map((moduleId) =>
              normalizeId(moduleId),
            ),
            canvasWidth: typeof item.canvasWidth === "number" ? item.canvasWidth : 1440,
            canvasHeight: typeof item.canvasHeight === "number" ? item.canvasHeight : 1024,
            createdAt:
              typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString(),
            updatedAt:
              typeof item.updatedAt === "string" ? item.updatedAt : new Date(0).toISOString(),
            validationErrors: normalizeStringArray(item.validationErrors),
          };
        })
        .filter((item): item is LayoutDraftOption => Boolean(item))
    : [];

export const parseThemeOptions = (value: unknown): ThemeOption[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (!isPlainObject(item)) {
            return null;
          }
          const themeId = typeof item.themeId === "string" ? normalizeId(item.themeId) : "";
          const title = typeof item.title === "string" ? item.title.trim() : "";
          const description = typeof item.description === "string" ? item.description.trim() : "";
          const tokens = parseThemeTokens(item.tokens);
          if (!themeId || !title || !tokens) {
            return null;
          }

          return {
            themeId,
            title,
            description,
            tokens,
            createdAt:
              typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString(),
            updatedAt:
              typeof item.updatedAt === "string" ? item.updatedAt : new Date(0).toISOString(),
          };
        })
        .filter((item): item is ThemeOption => Boolean(item))
    : [];

export const parseFinalDesignDraft = (value: unknown): FinalDesignDraft | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  if (
    typeof value.draftId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.content !== "string" ||
    typeof value.basedOnLayoutId !== "string" ||
    typeof value.basedOnThemeId !== "string"
  ) {
    return null;
  }

  return {
    draftId: normalizeId(value.draftId),
    title: value.title.trim(),
    notes: typeof value.notes === "string" ? value.notes : null,
    content: value.content,
    basedOnLayoutId: normalizeId(value.basedOnLayoutId),
    basedOnThemeId: normalizeId(value.basedOnThemeId),
    status: value.status === "approved" ? "approved" : "draft",
    revision:
      typeof value.revision === "number" && Number.isFinite(value.revision)
        ? Math.max(0, Math.floor(value.revision))
        : 0,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
};

export const parseModuleDraft = (value: unknown): ModuleDraft | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  if (
    typeof value.draftId !== "string" ||
    typeof value.moduleId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.html !== "string"
  ) {
    return null;
  }

  return {
    draftId: normalizeId(value.draftId),
    moduleId: normalizeId(value.moduleId),
    title: value.title.trim(),
    html: value.html,
    notes: typeof value.notes === "string" ? value.notes.trim() || null : null,
    assetsUsed: normalizeStringArray(value.assetsUsed).map((item) => normalizeId(item)),
    copySummary: typeof value.copySummary === "string" ? value.copySummary.trim() : "",
    status: value.status === "accepted" || value.status === "revised" ? value.status : "draft",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
};

export const parseDraftAssemblyRecord = (value: unknown): DraftAssemblyRecord | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  if (
    typeof value.draftId !== "string" ||
    typeof value.basedOnLayoutId !== "string" ||
    typeof value.basedOnThemeId !== "string" ||
    typeof value.assembledHtml !== "string"
  ) {
    return null;
  }

  return {
    draftId: normalizeId(value.draftId),
    basedOnLayoutId: normalizeId(value.basedOnLayoutId),
    basedOnThemeId: normalizeId(value.basedOnThemeId),
    moduleOrder: normalizeStringArray(value.moduleOrder).map((item) => normalizeId(item)),
    assembledHtml: value.assembledHtml,
    revision:
      typeof value.revision === "number" && Number.isFinite(value.revision)
        ? Math.max(0, Math.floor(value.revision))
        : 0,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
};

export const parseDraftRenderArtifact = (value: unknown): DraftRenderArtifact | null => {
  if (
    !isPlainObject(value) ||
    typeof value.draftId !== "string" ||
    typeof value.message !== "string"
  ) {
    return null;
  }

  return {
    draftId: normalizeId(value.draftId),
    revision:
      typeof value.revision === "number" && Number.isFinite(value.revision)
        ? Math.max(0, Math.floor(value.revision))
        : 0,
    deviceMode: value.deviceMode === "mobile" ? "mobile" : "desktop",
    status:
      value.status === "captured" || value.status === "failed" || value.status === "skipped"
        ? value.status
        : "disabled",
    localFilePath:
      typeof value.localFilePath === "string" ? value.localFilePath.trim() || null : null,
    imagePath: typeof value.imagePath === "string" ? value.imagePath.trim() || null : null,
    publicImageUrl:
      typeof value.publicImageUrl === "string" ? value.publicImageUrl.trim() || null : null,
    capturedAt: typeof value.capturedAt === "string" ? value.capturedAt : null,
    message: value.message,
  };
};

export const parseDraftCritiqueIssue = (value: unknown): DraftCritiqueIssue | null => {
  if (
    !isPlainObject(value) ||
    typeof value.title !== "string" ||
    typeof value.detail !== "string"
  ) {
    return null;
  }

  return {
    scope: value.scope === "module" ? "module" : "global",
    moduleId: typeof value.moduleId === "string" ? normalizeId(value.moduleId) : null,
    severity: value.severity === "high" || value.severity === "medium" ? value.severity : "low",
    title: value.title.trim(),
    detail: value.detail.trim(),
    recommendation: typeof value.recommendation === "string" ? value.recommendation.trim() : "",
  };
};

export const parseDraftCritique = (value: unknown): DraftCritique | null => {
  if (
    !isPlainObject(value) ||
    typeof value.draftId !== "string" ||
    typeof value.summary !== "string"
  ) {
    return null;
  }

  return {
    draftId: normalizeId(value.draftId),
    revision:
      typeof value.revision === "number" && Number.isFinite(value.revision)
        ? Math.max(0, Math.floor(value.revision))
        : 0,
    summary: value.summary.trim(),
    autoFixedModuleIds: normalizeStringArray(value.autoFixedModuleIds).map((item) =>
      normalizeId(item),
    ),
    issues: Array.isArray(value.issues)
      ? value.issues
          .map(parseDraftCritiqueIssue)
          .filter((item): item is DraftCritiqueIssue => Boolean(item))
      : [],
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
  };
};

export const validateFinalDraftHtml = (content: string) => {
  const errors: string[] = [];
  const trimmed = content.trim();

  if (!trimmed) {
    errors.push("content 不能为空");
  }
  if (/<script[\s>]/i.test(trimmed)) {
    errors.push("最终界面不允许包含 <script>");
  }
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) {
    errors.push("最终界面必须包含 HTML 结构");
  }

  return errors;
};

export const toLayoutOptionDetail = (option: LayoutOption) => option;
export const toLayoutOptionHttpDetail = (taskId: string, option: LayoutOption) => ({
  ...option,
  previewPath: getLayoutOptionPreviewPath(taskId, option.layoutId),
});
export const toLayoutDraftOptionHttpDetail = (option: LayoutDraftOption) => ({
  ...option,
  previewPath: null,
});
export const toThemeOptionDetail = (option: ThemeOption) => option;

export const toFinalDraftSummary = (taskId: string, draft: FinalDesignDraft) => ({
  draftId: draft.draftId,
  title: draft.title,
  status: draft.status,
  basedOnLayoutId: draft.basedOnLayoutId,
  basedOnThemeId: draft.basedOnThemeId,
  revision: draft.revision,
  updatedAt: draft.updatedAt,
  previewPath: getFinalDesignDraftPreviewPath(taskId, draft.draftId),
});

export const toFinalDraftDetail = (taskId: string, draft: FinalDesignDraft) => ({
  ...draft,
  previewPath: getFinalDesignDraftPreviewPath(taskId, draft.draftId),
});

export const toModuleDraftHttpDetail = (taskId: string, draft: ModuleDraft) => ({
  ...draft,
  previewPath: getModuleDraftPreviewPath(taskId, draft.draftId, draft.moduleId),
});

export const toDraftRenderArtifactHttpDetail = (taskId: string, artifact: DraftRenderArtifact) => {
  const { localFilePath: _localFilePath, ...rest } = artifact;
  return {
    ...rest,
    imagePath:
      artifact.imagePath || getFinalDesignDraftRenderImageHttpPath(taskId, artifact.draftId),
  };
};
