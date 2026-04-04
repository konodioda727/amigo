import type { EditFileDiagnostics } from "@amigo-llm/types";
import type { Sandbox } from "@/core/sandbox";

export interface EditFileDiagnosticsProviderPayload {
  taskId: string;
  parentId?: string;
  filePath: string;
  beforeContent?: string;
  afterContent: string;
  sandbox: Sandbox;
  signal?: AbortSignal;
}

export type EditFileDiagnosticsProvider = (
  payload: EditFileDiagnosticsProviderPayload,
) => Promise<EditFileDiagnostics | undefined> | EditFileDiagnostics | undefined;
