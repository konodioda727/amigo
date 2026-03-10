import {
  getPenpotBaseUrl,
  getPenpotRemoteState,
  importPenpotToDesignDoc,
  readPenpotBinding,
  syncDesignDocToPenpot,
  writePenpotBinding,
} from "../../appTools/designDocTools";

export const getPenpotBindingDetail = async (taskId: string, pageId: string) => {
  const penpotBaseUrl = getPenpotBaseUrl();
  const binding = readPenpotBinding(taskId, pageId);
  let syncState: { error: string } | Awaited<ReturnType<typeof getPenpotRemoteState>> | null = null;

  if (binding?.penpotUrl) {
    try {
      syncState = await getPenpotRemoteState(taskId, pageId);
    } catch (error) {
      syncState = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    success: true,
    taskId,
    pageId,
    penpotBaseUrl,
    binding,
    activeUrl: binding?.penpotUrl || penpotBaseUrl,
    syncState,
  };
};

export const updatePenpotBinding = (taskId: string, pageId: string, penpotUrl: string) => {
  const penpotBaseUrl = getPenpotBaseUrl();
  const binding = writePenpotBinding(taskId, pageId, penpotUrl);

  return {
    success: true,
    taskId,
    pageId,
    penpotBaseUrl,
    binding,
    activeUrl: binding.penpotUrl,
  };
};

export const syncPenpotDesignDoc = async (taskId: string, pageId: string) => {
  const result = await syncDesignDocToPenpot(taskId, pageId);
  return { success: true, taskId, sourcePageId: pageId, ...result };
};

export const importPenpotDesignDoc = async (taskId: string, pageId: string) => {
  const result = await importPenpotToDesignDoc(taskId, pageId);
  return { success: true, taskId, sourcePageId: pageId, ...result };
};
