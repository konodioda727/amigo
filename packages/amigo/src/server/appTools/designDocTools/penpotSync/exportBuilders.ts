import type { ExecutableDesignDoc } from "../designDocSchema";
import type { PenpotComponentBinding } from "../penpotBindings";
import { appendNodeChanges, createFrameShape } from "./builders";
import { createStablePenpotUuid, getRootShapeIds, sortNodesByZIndex } from "./shared";
import type { PenpotMediaObject, PenpotRpcFile, PenpotSemanticAnchorMap } from "./types";
import { ZERO_UUID } from "./types";

const buildPenpotChanges = (
  document: ExecutableDesignDoc,
  pageId: string,
  sectionFilter?: Set<string>,
  mediaObjectsByAssetUrl?: Record<string, PenpotMediaObject>,
  componentBindingsByRef?: Record<string, PenpotComponentBinding>,
) => {
  const anchors: PenpotSemanticAnchorMap = {};
  const changes: Record<string, unknown>[] = [
    {
      type: "mod-page",
      id: pageId,
      background: document.page.background,
      name: document.page.name,
    },
  ];

  for (const section of document.sections) {
    if (sectionFilter && !sectionFilter.has(section.id)) {
      continue;
    }
    const sectionSeed = `section:${section.id}`;
    const sectionId = createStablePenpotUuid(sectionSeed);
    anchors[sectionId] = {
      entityType: "section",
      semanticId: section.id,
      displayName: section.name,
    };
    const sectionChanges: Record<string, unknown>[] = [];
    const sectionChildIds: string[] = [];

    for (const node of sortNodesByZIndex(section.nodes)) {
      sectionChildIds.push(
        ...appendNodeChanges({
          document,
          node,
          pageId,
          frameId: sectionId,
          parentId: sectionId,
          parentAbsoluteX: section.x ?? 0,
          parentAbsoluteY: section.y,
          changes: sectionChanges,
          semanticPath: sectionSeed,
          anchors,
          mediaObjectsByAssetUrl,
          componentBindingsByRef,
        }),
      );
    }

    changes.push({
      type: "add-obj",
      id: sectionId,
      "page-id": pageId,
      "frame-id": ZERO_UUID,
      obj: createFrameShape(
        sectionId,
        section.name,
        section.x ?? 0,
        section.y,
        section.width ?? document.page.width,
        section.height,
        ZERO_UUID,
        ZERO_UUID,
        section.background,
        section.x ?? 0,
        section.y,
        sectionChildIds,
        0,
      ),
    });
    changes.push(...sectionChanges);
  }

  return {
    changes,
    anchors,
  };
};

export const buildReplacePageChanges = (
  file: PenpotRpcFile,
  document: ExecutableDesignDoc,
  pageId: string,
  mediaObjectsByAssetUrl?: Record<string, PenpotMediaObject>,
  componentBindingsByRef?: Record<string, PenpotComponentBinding>,
) => {
  const deleteChanges = getRootShapeIds(file, pageId).map((shapeId) => ({
    type: "del-obj",
    id: shapeId,
    "page-id": pageId,
  }));

  const built = buildPenpotChanges(
    document,
    pageId,
    undefined,
    mediaObjectsByAssetUrl,
    componentBindingsByRef,
  );
  return {
    changes: [...deleteChanges, ...built.changes],
    anchors: built.anchors,
  };
};

export const buildCreatePageChanges = (
  document: ExecutableDesignDoc,
  pageId: string,
  mediaObjectsByAssetUrl?: Record<string, PenpotMediaObject>,
  componentBindingsByRef?: Record<string, PenpotComponentBinding>,
) => {
  const built = buildPenpotChanges(
    document,
    pageId,
    undefined,
    mediaObjectsByAssetUrl,
    componentBindingsByRef,
  );
  return {
    changes: [
      {
        type: "add-page",
        id: pageId,
        name: document.page.name,
      },
      ...built.changes,
    ],
    anchors: built.anchors,
  };
};

export const buildReplaceSectionChanges = (
  file: PenpotRpcFile,
  document: ExecutableDesignDoc,
  pageId: string,
  sectionIds: string[],
  mediaObjectsByAssetUrl?: Record<string, PenpotMediaObject>,
  componentBindingsByRef?: Record<string, PenpotComponentBinding>,
) => {
  const sectionIdSet = new Set(sectionIds);
  const rootShapeIds = new Set(getRootShapeIds(file, pageId));
  const deleteChanges = document.sections
    .filter((section) => sectionIdSet.has(section.id))
    .map((section) => createStablePenpotUuid(`section:${section.id}`))
    .filter((shapeId) => rootShapeIds.has(shapeId))
    .map((shapeId) => ({
      type: "del-obj",
      id: shapeId,
      "page-id": pageId,
    }));

  const built = buildPenpotChanges(
    document,
    pageId,
    sectionIdSet,
    mediaObjectsByAssetUrl,
    componentBindingsByRef,
  );
  return {
    changes: [
      ...deleteChanges,
      ...built.changes.filter((change, index) => !(index === 0 && change.type === "mod-page")),
    ],
    anchors: built.anchors,
  };
};
