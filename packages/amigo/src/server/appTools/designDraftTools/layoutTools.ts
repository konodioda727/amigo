import { defineTool } from "@amigo-llm/backend";
import { resolveDesignDocOwnerTaskId } from "../designDocTools/designDocScope";
import {
  coerceLayoutCanvasSize,
  countLayoutSkeletonBlocks,
  extractLayoutSkeletonModuleIds,
  inferLayoutSkeletonCanvasSize,
  validateLayoutSkeletonSource,
} from "./layoutSource";
import { compileLayoutOptionPreview } from "./preview";
import {
  type DesignSession,
  type LayoutDraftOption,
  type LayoutOption,
  normalizeId,
  toLayoutDraftOptionHttpDetail,
  toLayoutOptionHttpDetail,
} from "./shared";
import {
  readStoredDesignSession,
  readStoredLayoutDraftOptions,
  readStoredLayoutOptions,
  removeStoredLayoutDraftOptions,
  upsertStoredLayoutDraftOptions,
  upsertStoredLayoutOptions,
} from "./storage";

export const applyLayoutSourcePatch = (input: {
  currentSource: string;
  content?: unknown;
  startLine?: unknown;
  endLine?: unknown;
  search?: unknown;
  replace?: unknown;
  replaceAll?: unknown;
  failIfNoMatch?: unknown;
}) => {
  const hasLinePatch = input.startLine !== undefined || input.endLine !== undefined;
  const hasSearchReplace = input.search !== undefined || input.replace !== undefined;

  if (hasLinePatch && hasSearchReplace) {
    return {
      source: null,
      errors: ["不能同时使用按行 patch 和 search/replace 两种修改方式"],
    };
  }

  if (hasLinePatch) {
    const startLine =
      typeof input.startLine === "number"
        ? Math.trunc(input.startLine)
        : typeof input.startLine === "string"
          ? Number.parseInt(input.startLine, 10)
          : Number.NaN;
    const endLine =
      typeof input.endLine === "number"
        ? Math.trunc(input.endLine)
        : typeof input.endLine === "string"
          ? Number.parseInt(input.endLine, 10)
          : Number.NaN;

    if (
      !Number.isFinite(startLine) ||
      !Number.isFinite(endLine) ||
      startLine <= 0 ||
      endLine < startLine
    ) {
      return {
        source: null,
        errors: [
          "按行 patch 需要提供合法的 startLine 和 endLine，且 startLine >= 1、endLine >= startLine",
        ],
      };
    }
    if (typeof input.content !== "string") {
      return {
        source: null,
        errors: ["按行 patch 时 content 必须是字符串"],
      };
    }

    const lines = input.currentSource.split("\n");
    if (startLine > lines.length + 1) {
      return {
        source: null,
        errors: [`startLine 超出范围，当前 source 只有 ${lines.length} 行`],
      };
    }

    return {
      source: [
        ...lines.slice(0, startLine - 1),
        ...input.content.split("\n"),
        ...lines.slice(Math.min(lines.length, endLine)),
      ].join("\n"),
      errors: [],
    };
  }

  if (hasSearchReplace) {
    if (typeof input.search !== "string" || input.search.length === 0) {
      return {
        source: null,
        errors: ["search/replace 模式下 search 不能为空字符串"],
      };
    }
    if (input.replace === undefined) {
      return {
        source: null,
        errors: ["search/replace 模式下 replace 不能为空"],
      };
    }

    const replaceText = String(input.replace);
    const replaceAll = input.replaceAll === true || input.replaceAll === "true";
    const failIfNoMatch = input.failIfNoMatch !== false && input.failIfNoMatch !== "false";
    const hasMatch = input.currentSource.includes(input.search);

    if (!hasMatch && failIfNoMatch) {
      return {
        source: null,
        errors: ["search/replace 没有命中任何内容"],
      };
    }

    return {
      source: replaceAll
        ? input.currentSource.split(input.search).join(replaceText)
        : input.currentSource.replace(input.search, replaceText),
      errors: [],
    };
  }

  return {
    source: null,
    errors: ["必须提供一种修改方式：按行 patch，或 search/replace"],
  };
};

const extractMissingModulesFromErrors = (errors: string[]) =>
  errors.flatMap((error) => {
    const match = error.match(/缺少这些模块:\s*(.+)$/);
    if (!match) {
      return [];
    }
    return match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  });

const buildLayoutRepairHint = (draftOptions: LayoutDraftOption[]) => {
  const hasMixedPatchModeError = draftOptions.some((draft) =>
    (draft.validationErrors || []).some((error) =>
      error.includes("不能同时使用按行 patch 和 search/replace 两种修改方式"),
    ),
  );
  if (hasMixedPatchModeError) {
    return "单个 layout option 一次只能选一种 patch：要么只传 search/replace，要么只传 startLine/endLine/content。先调用 readLayoutOptions 阅读原 source，再删掉另一组参数后重试。";
  }

  const missingModuleHints = draftOptions
    .map((draft) => {
      const missingModules = extractMissingModulesFromErrors(draft.validationErrors || []);
      if (missingModules.length === 0) {
        return null;
      }
      return `${draft.layoutId} -> ${missingModules.join(", ")}`;
    })
    .filter((item): item is string => Boolean(item));
  if (missingModuleHints.length > 0) {
    return `先调用 readLayoutOptions 阅读原 source，再只补这些缺失模块：${missingModuleHints.join("；")}。优先用 startLine/endLine/content 补一个完整的 <section data-module-id="..."> 骨架，不要改其他区域。`;
  }

  return "下一步请先调用 readLayoutOptions 阅读这些草稿的原 source，再复用原 layoutId，用 search/replace 或按行 patch 修正，不要重写整段 source。";
};

const createLayoutOptionResult = (
  input: Record<string, unknown>,
  session: DesignSession,
  existing?: LayoutOption,
): { option: LayoutOption | null; errors: string[] } => {
  const errors: string[] = [];
  const layoutId = typeof input.layoutId === "string" ? normalizeId(input.layoutId) : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const source = typeof input.source === "string" ? input.source.trim() : "";
  const sourceValidationErrors = validateLayoutSkeletonSource(source);
  if (!layoutId) {
    errors.push("layoutId 不能为空");
  }
  if (!title) {
    errors.push("title 不能为空");
  }
  if (sourceValidationErrors.length > 0) {
    errors.push(...sourceValidationErrors);
  }
  if (errors.length > 0) {
    return { option: null, errors };
  }

  const validModuleIds = new Set(session.modules.map((module) => module.id));
  const moduleIds = extractLayoutSkeletonModuleIds(source, input.moduleIds).filter((moduleId) =>
    validModuleIds.has(moduleId),
  );
  const missingModuleIds = session.modules
    .map((module) => module.id)
    .filter((moduleId) => !moduleIds.includes(moduleId));
  if (moduleIds.length === 0 || missingModuleIds.length > 0) {
    errors.push(`缺少这些模块: ${missingModuleIds.join(", ")}`);
    return { option: null, errors };
  }

  if (countLayoutSkeletonBlocks(source) < Math.max(6, session.modules.length + 1)) {
    errors.push("布局骨架层级太少，需要更完整的页面框架和二级占位结构");
    return { option: null, errors };
  }

  const inferredCanvas = inferLayoutSkeletonCanvasSize(source);
  const now = new Date().toISOString();
  return {
    option: {
      layoutId,
      title,
      description: typeof input.description === "string" ? input.description.trim() : "",
      source,
      moduleIds,
      canvasWidth:
        coerceLayoutCanvasSize(input.canvasWidth) || existing?.canvasWidth || inferredCanvas.width,
      canvasHeight:
        coerceLayoutCanvasSize(input.canvasHeight) ||
        existing?.canvasHeight ||
        inferredCanvas.height,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    },
    errors: [],
  };
};

const createLayoutDraftOption = (input: {
  item: Record<string, unknown>;
  session: DesignSession;
  index: number;
  validationErrors: string[];
  existing?: LayoutOption | LayoutDraftOption;
  patchedSource?: string | null;
}): LayoutDraftOption => {
  const now = new Date().toISOString();
  const explicitLayoutId =
    typeof input.item.layoutId === "string" ? normalizeId(input.item.layoutId) : "";
  const layoutId = explicitLayoutId || `layout-draft-${Date.now()}-${input.index + 1}`;
  const source =
    typeof input.patchedSource === "string"
      ? input.patchedSource
      : typeof input.item.source === "string"
        ? input.item.source.trim()
        : input.existing?.source || "";
  const validModuleIds = new Set(input.session.modules.map((module) => module.id));
  const moduleIds = extractLayoutSkeletonModuleIds(source, input.item.moduleIds).filter(
    (moduleId) => validModuleIds.has(moduleId),
  );
  const inferredCanvas = inferLayoutSkeletonCanvasSize(source);

  return {
    layoutId,
    title:
      typeof input.item.title === "string" && input.item.title.trim()
        ? input.item.title.trim()
        : input.existing?.title || `未命名布局草稿 ${input.index + 1}`,
    description:
      typeof input.item.description === "string"
        ? input.item.description.trim()
        : input.existing?.description || "",
    source,
    moduleIds,
    canvasWidth:
      coerceLayoutCanvasSize(input.item.canvasWidth) ||
      input.existing?.canvasWidth ||
      inferredCanvas.width,
    canvasHeight:
      coerceLayoutCanvasSize(input.item.canvasHeight) ||
      input.existing?.canvasHeight ||
      inferredCanvas.height,
    createdAt: input.existing?.createdAt || now,
    updatedAt: now,
    validationErrors: Array.from(
      new Set(input.validationErrors.map((error) => error.trim()).filter(Boolean)),
    ),
  };
};

export const readLayoutOptionsTool = defineTool({
  name: "readLayoutOptions",
  description: "读取当前任务下的布局方案和已选布局。",
  whenToUse:
    "在布局探索前后读取当前布局方案，避免覆盖已有决策。只要布局需要返工，不管是缺模块、彩色 class、可见文字、渐变、结构问题还是 patch 失败，都先读取现有 source，再继续使用 upsertLayoutOptions 对原 layoutId 做局部修改；除非结构方向整体推翻，否则不要整段重写。",
  params: [],
  async invoke({ context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          options: [],
          draftOptions: [],
          modules: [],
          selectedLayoutId: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const session = readStoredDesignSession(ownerTaskId);
    const options = readStoredLayoutOptions(ownerTaskId).map((option) =>
      toLayoutOptionHttpDetail(ownerTaskId, option),
    );
    const draftOptions = readStoredLayoutDraftOptions(ownerTaskId).map(
      toLayoutDraftOptionHttpDetail,
    );
    const message =
      options.length > 0 || draftOptions.length > 0
        ? draftOptions.length > 0
          ? `已读取 ${options.length} 个正式布局方案，${draftOptions.length} 个待修订草稿。任何返工都先基于这些现有 source 阅读后再 patch；下一步请优先复用这些草稿的原 layoutId 做 patch，不要重画新方案。`
          : `已读取 ${options.length} 个正式布局方案`
        : "当前还没有布局方案";
    return {
      message,
      toolResult: {
        success: true,
        options,
        draftOptions,
        modules: session?.modules || [],
        selectedLayoutId: session?.selectedLayoutId || null,
        validationErrors: [],
        message,
      },
    };
  },
});

export const upsertLayoutOptionsTool = defineTool({
  name: "upsertLayoutOptions",
  description:
    "写入或修改布局方案。这个工具同时负责初次创建和后续 patch。布局阶段只允许输出黑白灰 HTML + Tailwind 线框骨架。",
  whenToUse:
    "初次布局时一次提交 2 个完整方案。任何返工都先 readLayoutOptions 阅读现有 source，再复用原 layoutId 做局部 patch，不要重画。若返回了 draftOptions，下一步必须先 readLayoutOptions，再继续修这些 draftOptions。先补缺失模块，再修 class/文字/渐变/script；缺块和文本/class 问题优先 search/replace，结构微调再用按行 patch。",
  completionBehavior: "idle",
  params: [
    {
      name: "options",
      optional: false,
      type: "array",
      description:
        "布局方案数组。初次创建时一次提供 2 个完整方案；返工时只传需要修改的 layoutId，并做局部 patch。",
      params: [
        {
          name: "option",
          optional: false,
          description: "单个布局方案或单个布局修补操作",
          type: "object",
          params: [
            { name: "layoutId", optional: false, description: "布局方案 ID，推荐 kebab-case" },
            {
              name: "title",
              optional: true,
              description: "布局方案标题。初次创建或整段重写时必填；局部修补时不传则沿用原值",
            },
            {
              name: "description",
              optional: true,
              description: "布局方案说明；局部修补时不传则沿用原值",
            },
            {
              name: "canvasWidth",
              optional: true,
              description: "布局画布宽度；局部修补时不传则沿用原值",
            },
            {
              name: "canvasHeight",
              optional: true,
              description: "布局画布高度；局部修补时不传则沿用原值",
            },
            {
              name: "source",
              optional: true,
              description:
                "HTML + Tailwind 布局骨架源码。只在初次创建或整段重写时传。必须使用 data-module-id，且只能用黑白灰占位块表达结构；禁止真实文字、渐变、彩色、script 和完整文档标签。",
            },
            {
              name: "content",
              optional: true,
              description: "局部修补模式下，用于替换指定行范围的新内容",
            },
            {
              name: "startLine",
              optional: true,
              description: "局部修补模式下的起始行号（从 1 开始）",
            },
            {
              name: "endLine",
              optional: true,
              description: "局部修补模式下的结束行号（包含）",
            },
            {
              name: "search",
              optional: true,
              description: "局部修补模式下要查找的原始文本",
            },
            {
              name: "replace",
              optional: true,
              description: "局部修补模式下要替换成的新文本",
            },
            {
              name: "replaceAll",
              optional: true,
              description: "局部修补模式下是否替换全部匹配，默认 false",
            },
            {
              name: "failIfNoMatch",
              optional: true,
              description: "局部修补模式下无匹配时是否报错，默认 true",
            },
            {
              name: "moduleIds",
              optional: true,
              type: "array",
              description: "该布局覆盖的模块 ID，作为源码中 data-module-id 的补充。",
              params: [{ name: "moduleId", optional: false, description: "模块 ID" }],
            },
          ],
        },
      ],
    },
  ],
  async invoke({ params, context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          options: [],
          draftOptions: [],
          modules: [],
          selectedLayoutId: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const session = readStoredDesignSession(ownerTaskId);
    if (!session) {
      const message = "请先创建 design session，再生成布局方案";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          options: [],
          draftOptions: [],
          modules: [],
          selectedLayoutId: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const existingOptions = readStoredLayoutOptions(ownerTaskId);
    const existingDraftOptions = readStoredLayoutDraftOptions(ownerTaskId);
    const existingMap = new Map(existingOptions.map((option) => [option.layoutId, option]));
    const existingDraftMap = new Map(
      existingDraftOptions.map((option) => [option.layoutId, option]),
    );
    const requestedCount = Array.isArray(params.options) ? params.options.length : 0;
    const isInitialCreation = existingOptions.length === 0;

    if (requestedCount === 0) {
      const message = "options 至少要包含一个布局方案";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          options: existingOptions.map((option) => toLayoutOptionHttpDetail(ownerTaskId, option)),
          draftOptions: existingDraftOptions.map(toLayoutDraftOptionHttpDetail),
          modules: session.modules,
          selectedLayoutId: session.selectedLayoutId,
          validationErrors: [message],
          message,
        },
      };
    }

    const results = Array.isArray(params.options)
      ? params.options.map((item, index) => {
          if (!item || typeof item !== "object") {
            return { option: null, draft: null, errors: ["布局方案必须是对象"] };
          }

          const payload = item as Record<string, unknown>;
          const layoutId =
            typeof payload.layoutId === "string" ? normalizeId(payload.layoutId as string) : "";
          const existing = existingDraftMap.get(layoutId) || existingMap.get(layoutId);
          const hasSource = typeof payload.source === "string";
          const hasPatchOperation =
            payload.startLine !== undefined ||
            payload.endLine !== undefined ||
            payload.search !== undefined ||
            payload.replace !== undefined;

          if (hasSource && hasPatchOperation) {
            const errors = ["不能同时传 source 和局部 patch 参数；二选一"];
            return {
              option: null,
              draft: createLayoutDraftOption({
                item: payload,
                session,
                index,
                validationErrors: errors,
                existing,
              }),
              errors,
            };
          }

          if (hasPatchOperation) {
            if (!layoutId || !existing) {
              const errors = [
                layoutId
                  ? `局部修补必须复用已有 layoutId，未找到 ${layoutId}`
                  : "局部修补时 layoutId 不能为空",
              ];
              return {
                option: null,
                draft: createLayoutDraftOption({
                  item: payload,
                  session,
                  index,
                  validationErrors: errors,
                  existing,
                }),
                errors,
              };
            }

            const patchResult = applyLayoutSourcePatch({
              currentSource: existing.source,
              content: payload.content,
              startLine: payload.startLine,
              endLine: payload.endLine,
              search: payload.search,
              replace: payload.replace,
              replaceAll: payload.replaceAll,
              failIfNoMatch: payload.failIfNoMatch,
            });
            if (patchResult.errors.length > 0 || !patchResult.source) {
              const errors =
                patchResult.errors.length > 0 ? patchResult.errors : ["布局局部修改失败"];
              return {
                option: null,
                draft: createLayoutDraftOption({
                  item: payload,
                  session,
                  index,
                  validationErrors: errors,
                  existing,
                  patchedSource: patchResult.source,
                }),
                errors,
              };
            }

            const nextResult = createLayoutOptionResult(
              {
                layoutId,
                title: typeof payload.title === "string" ? payload.title : existing.title,
                description:
                  typeof payload.description === "string"
                    ? payload.description
                    : existing.description,
                source: patchResult.source,
                canvasWidth: payload.canvasWidth ?? existing.canvasWidth,
                canvasHeight: payload.canvasHeight ?? existing.canvasHeight,
              },
              session,
              existingMap.get(layoutId),
            );

            return {
              ...nextResult,
              draft: nextResult.option
                ? null
                : createLayoutDraftOption({
                    item: payload,
                    session,
                    index,
                    validationErrors: nextResult.errors,
                    existing,
                    patchedSource: patchResult.source,
                  }),
            };
          }

          if (!hasSource) {
            const errors = ["必须提供 source，或提供一组局部 patch 参数"];
            return {
              option: null,
              draft: createLayoutDraftOption({
                item: payload,
                session,
                index,
                validationErrors: errors,
                existing,
              }),
              errors,
            };
          }

          const nextResult = createLayoutOptionResult(payload, session, existingMap.get(layoutId));
          return {
            ...nextResult,
            draft: nextResult.option
              ? null
              : createLayoutDraftOption({
                  item: payload,
                  session,
                  index,
                  validationErrors: nextResult.errors,
                  existing,
                }),
          };
        })
      : [];
    const options = results
      .map((item) => item.option)
      .filter((item): item is LayoutOption => Boolean(item));
    const validationErrors = results.flatMap((item, index) =>
      item.errors.map((error) => `方案 ${index + 1}: ${error}`),
    );
    const batchLevelErrors: string[] = [];
    if (isInitialCreation && requestedCount !== 2) {
      batchLevelErrors.push("初次生成布局时必须一次提供 2 个合法布局方案");
    }
    if (isInitialCreation && options.length !== 2) {
      batchLevelErrors.push("初次生成布局时必须得到 2 个合法布局方案");
    }
    const allErrors = [...validationErrors, ...batchLevelErrors];

    if (allErrors.length > 0) {
      const draftsToPersist = Array.isArray(params.options)
        ? params.options
            .map((item, index) => {
              if (!item || typeof item !== "object") {
                return null;
              }
              const payload = item as Record<string, unknown>;
              const layoutId =
                typeof payload.layoutId === "string" ? normalizeId(payload.layoutId as string) : "";
              const existing = existingDraftMap.get(layoutId) || existingMap.get(layoutId);
              const preparedDraft = results[index]?.draft;
              return (
                preparedDraft ||
                createLayoutDraftOption({
                  item: payload,
                  session,
                  index,
                  validationErrors: [...(results[index]?.errors || []), ...batchLevelErrors],
                  existing,
                })
              );
            })
            .filter((item): item is LayoutDraftOption => Boolean(item))
        : [];
      const nextDraftOptions = upsertStoredLayoutDraftOptions(ownerTaskId, draftsToPersist);
      const repairHint = buildLayoutRepairHint(nextDraftOptions);
      const message = `${allErrors[0] || "布局方案校验失败"}。已保存 ${nextDraftOptions.length} 个待修订草稿；${repairHint}`;
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          options: existingOptions.map((option) => toLayoutOptionHttpDetail(ownerTaskId, option)),
          draftOptions: nextDraftOptions.map(toLayoutDraftOptionHttpDetail),
          modules: session.modules,
          selectedLayoutId: session.selectedLayoutId,
          validationErrors: allErrors,
          message,
        },
      };
    }

    const mergedOptionsPreview = [...existingOptions];
    for (const option of options) {
      const existingIndex = mergedOptionsPreview.findIndex(
        (existing) => existing.layoutId === option.layoutId,
      );
      if (existingIndex >= 0) {
        mergedOptionsPreview[existingIndex] = option;
      } else {
        mergedOptionsPreview.push(option);
      }
    }

    if (mergedOptionsPreview.length < 2) {
      const message =
        "布局候选必须至少保留 2 个方案；返工时请复用已有 layoutId 修改，而不是只留下 1 个方案";
      const nextDraftOptions = upsertStoredLayoutDraftOptions(
        ownerTaskId,
        (Array.isArray(params.options) ? params.options : [])
          .map((item, index) => {
            if (!item || typeof item !== "object") {
              return null;
            }
            const payload = item as Record<string, unknown>;
            const layoutId =
              typeof payload.layoutId === "string" ? normalizeId(payload.layoutId as string) : "";
            const existing = existingDraftMap.get(layoutId) || existingMap.get(layoutId);
            const preparedDraft = results[index]?.draft;
            return (
              preparedDraft ||
              createLayoutDraftOption({
                item: payload,
                session,
                index,
                validationErrors: [message],
                existing,
              })
            );
          })
          .filter((item): item is LayoutDraftOption => Boolean(item)),
      );
      return {
        message: `${message}。已保存待修订草稿；下一步请继续复用原 layoutId 做 patch，而不是重画。`,
        error: `${message}。已保存待修订草稿；下一步请继续复用原 layoutId 做 patch，而不是重画。`,
        toolResult: {
          success: false,
          options: existingOptions.map((option) => toLayoutOptionHttpDetail(ownerTaskId, option)),
          draftOptions: nextDraftOptions.map(toLayoutDraftOptionHttpDetail),
          modules: session.modules,
          selectedLayoutId: session.selectedLayoutId,
          validationErrors: [message],
          message: `${message}。已保存待修订草稿；下一步请继续复用原 layoutId 做 patch，而不是重画。`,
        },
      };
    }

    const mergedOptions = upsertStoredLayoutOptions(ownerTaskId, options);
    const nextDraftOptions = removeStoredLayoutDraftOptions(
      ownerTaskId,
      options.map((option) => option.layoutId),
    );

    await Promise.all(
      mergedOptions.map((option) => compileLayoutOptionPreview(ownerTaskId, option.layoutId)),
    );
    return {
      message: isInitialCreation
        ? `已更新 ${mergedOptions.length} 个布局方案`
        : `已修改 ${options.length} 个布局方案，当前共保留 ${mergedOptions.length} 个候选`,
      toolResult: {
        success: true,
        options: mergedOptions.map((option) => toLayoutOptionHttpDetail(ownerTaskId, option)),
        draftOptions: nextDraftOptions.map(toLayoutDraftOptionHttpDetail),
        modules: session.modules,
        selectedLayoutId: session.selectedLayoutId,
        validationErrors: [],
        message: isInitialCreation
          ? `已更新 ${mergedOptions.length} 个布局方案`
          : `已修改 ${options.length} 个布局方案，当前共保留 ${mergedOptions.length} 个候选`,
      },
    };
  },
});

export const patchLayoutOptionSourceTool = defineTool({
  name: "patchLayoutOptionSource",
  description:
    "按 layoutId 局部修改已有布局方案的 source，适合修复局部错误而不是整段重写。支持按行 patch 和 search/replace，两种方式都只作用于当前 layoutId 的现有源码。",
  whenToUse:
    "当某个已有布局方案只有局部问题时使用，例如删掉可见文字、改掉彩色 class、补上缺失模块或调整局部骨架。先 readLayoutOptions 查看原 source，再对同一个 layoutId 做局部修改；不要为了修一个小问题整段重写整个布局。",
  completionBehavior: "idle",
  params: [
    { name: "layoutId", optional: false, description: "要修改的布局方案 ID" },
    {
      name: "content",
      optional: true,
      description: "按行 patch 模式下用于替换指定行范围的新内容",
    },
    {
      name: "startLine",
      optional: true,
      description: "按行 patch 模式下的起始行号（从 1 开始）",
    },
    {
      name: "endLine",
      optional: true,
      description: "按行 patch 模式下的结束行号（包含）",
    },
    {
      name: "search",
      optional: true,
      description: "search/replace 模式下要查找的原始文本",
    },
    {
      name: "replace",
      optional: true,
      description: "search/replace 模式下要替换成的新文本",
    },
    {
      name: "replaceAll",
      optional: true,
      description: "search/replace 模式下是否替换全部匹配，默认 false",
    },
    {
      name: "failIfNoMatch",
      optional: true,
      description: "search/replace 模式下无匹配时是否报错，默认 true",
    },
    {
      name: "title",
      optional: true,
      description: "可选：同步更新布局标题；未提供则保留原值",
    },
    {
      name: "description",
      optional: true,
      description: "可选：同步更新布局说明；未提供则保留原值",
    },
    {
      name: "canvasWidth",
      optional: true,
      description: "可选：同步更新布局画布宽度；未提供则保留原值",
    },
    {
      name: "canvasHeight",
      optional: true,
      description: "可选：同步更新布局画布高度；未提供则保留原值",
    },
  ],
  async invoke({ params, context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          updatedLayoutId: null,
          options: [],
          draftOptions: [],
          modules: [],
          selectedLayoutId: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const session = readStoredDesignSession(ownerTaskId);
    if (!session) {
      const message = "请先创建 design session，再修改布局方案";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          updatedLayoutId: null,
          options: [],
          draftOptions: [],
          modules: [],
          selectedLayoutId: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const layoutId = typeof params.layoutId === "string" ? normalizeId(params.layoutId) : "";
    const existingOptions = readStoredLayoutOptions(ownerTaskId);
    const existingDraftOptions = readStoredLayoutDraftOptions(ownerTaskId);
    const existing = existingOptions.find((option) => option.layoutId === layoutId);
    if (!layoutId || !existing) {
      const message = layoutId ? `未找到布局方案 ${layoutId}` : "layoutId 不能为空";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          updatedLayoutId: null,
          options: existingOptions.map((option) => toLayoutOptionHttpDetail(ownerTaskId, option)),
          draftOptions: existingDraftOptions.map(toLayoutDraftOptionHttpDetail),
          modules: session.modules,
          selectedLayoutId: session.selectedLayoutId,
          validationErrors: [message],
          message,
        },
      };
    }

    const patchResult = applyLayoutSourcePatch({
      currentSource: existing.source,
      content: params.content,
      startLine: params.startLine,
      endLine: params.endLine,
      search: params.search,
      replace: params.replace,
      replaceAll: params.replaceAll,
      failIfNoMatch: params.failIfNoMatch,
    });
    if (patchResult.errors.length > 0 || !patchResult.source) {
      const message = patchResult.errors[0] || "布局局部修改失败";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          updatedLayoutId: null,
          options: existingOptions.map((option) => toLayoutOptionHttpDetail(ownerTaskId, option)),
          draftOptions: existingDraftOptions.map(toLayoutDraftOptionHttpDetail),
          modules: session.modules,
          selectedLayoutId: session.selectedLayoutId,
          validationErrors: patchResult.errors.length > 0 ? patchResult.errors : [message],
          message,
        },
      };
    }

    const nextResult = createLayoutOptionResult(
      {
        layoutId,
        title: typeof params.title === "string" ? params.title : existing.title,
        description:
          typeof params.description === "string" ? params.description : existing.description,
        source: patchResult.source,
        canvasWidth: params.canvasWidth ?? existing.canvasWidth,
        canvasHeight: params.canvasHeight ?? existing.canvasHeight,
      },
      session,
      existing,
    );
    if (!nextResult.option) {
      const message = nextResult.errors[0] || `布局方案 ${layoutId} 校验失败`;
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          updatedLayoutId: null,
          options: existingOptions.map((option) => toLayoutOptionHttpDetail(ownerTaskId, option)),
          draftOptions: existingDraftOptions.map(toLayoutDraftOptionHttpDetail),
          modules: session.modules,
          selectedLayoutId: session.selectedLayoutId,
          validationErrors: nextResult.errors,
          message,
        },
      };
    }

    const mergedOptions = upsertStoredLayoutOptions(ownerTaskId, [nextResult.option]);
    await compileLayoutOptionPreview(ownerTaskId, layoutId);
    return {
      message: `已局部修改布局方案 ${layoutId}`,
      toolResult: {
        success: true,
        updatedLayoutId: layoutId,
        options: mergedOptions.map((option) => toLayoutOptionHttpDetail(ownerTaskId, option)),
        draftOptions: existingDraftOptions.map(toLayoutDraftOptionHttpDetail),
        modules: session.modules,
        selectedLayoutId: session.selectedLayoutId,
        validationErrors: [],
        message: `已局部修改布局方案 ${layoutId}`,
      },
    };
  },
});
