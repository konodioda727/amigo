import type {
  EditFileDiagnosticsProvider,
  EditFileDiagnosticsProviderPayload,
} from "@amigo-llm/backend";
import {
  getDefaultLanguageIntelligenceService,
  getLanguageForPath,
  type LanguageIntelligenceService,
} from "./languageIntelligenceService";

export const createEditFileDiagnosticsProvider = (
  service: Pick<
    LanguageIntelligenceService,
    "getDiagnostics"
  > = getDefaultLanguageIntelligenceService(),
): EditFileDiagnosticsProvider => {
  return async (payload: EditFileDiagnosticsProviderPayload) => {
    if (!getLanguageForPath(payload.filePath)) {
      return undefined;
    }

    return service.getDiagnostics({
      taskId: payload.parentId || payload.taskId,
      filePath: payload.filePath,
      content: payload.afterContent,
      conversationContext: payload.conversationContext,
      sandbox: payload.sandbox,
    });
  };
};

export const __testing__ = {
  getLanguageForPath,
};
