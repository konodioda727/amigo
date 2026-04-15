import { existsSync, rmSync } from "node:fs";
import type {
  ChatMessage,
  ContextUsageStatus,
  ConversationStatus,
  ExecutionTaskStatus,
  PendingToolCall,
  TaskStatusMapUpdatedData,
  ToolInterface,
  WebSocketMessage,
  WorkflowAgentRole,
  WorkflowMode,
  WorkflowPhase,
  WorkflowState,
} from "@amigo-llm/types";
import { CONTROLLER_DEFAULT_WORKFLOW_PHASE_SEQUENCE } from "@amigo-llm/types";
import { v4 as uuidV4 } from "uuid";
import { FilePersistedMemory } from "../memory";
import type { AmigoLlm } from "../model";
import type { ModelConfigSnapshot } from "../model/contextConfig";
import { getTaskId } from "../templates/checklistParser";
import type { ToolService } from "../tools";
import { getTaskListPath } from "../tools/taskList/utils";
import { createWorkflowState, normalizeWorkflowState, transitionWorkflowState } from "../workflow";
import {
  getConfiguredAutoApproveToolNames,
  normalizeAutoApproveToolNames,
} from "./context/autoApproveTools";
import { buildCheckpointMessage } from "./context/conversationCheckpoint";
import { buildRecoveredConversationRuntime } from "./context/conversationRecovery";
import { buildConversationSystemPrompt } from "./context/conversationSystemPrompt";
import {
  announceWorkflowState,
  resolveConversationWorkflowFallbackState,
} from "./context/conversationWorkflowState";
import { parseAssistantToolCallMessage, parseToolResultMessage } from "./context/toolTranscript";
import { broadcaster } from "./lifecycle/WebSocketBroadcaster";

const cloneChatMessage = (message: (typeof FilePersistedMemory.prototype.messages)[number]) => ({
  ...message,
  attachments: message.attachments ? [...message.attachments] : undefined,
});

const normalizeCompletionResultText = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2).trim();
  } catch {
    return String(value).trim();
  }
};

const isCheckpointMessage = (
  message: (typeof FilePersistedMemory.prototype.messages)[number],
): boolean => message.type === "checkpoint";

const collectSeedHistoryFromLastCompletion = (
  memory: FilePersistedMemory,
): NonNullable<WorkflowState["completionSeedState"]> | null => {
  const previousSeedState = memory.workflowState?.completionSeedState;
  const sourceMessages = memory.messages;
  const cycleStartIndex = Math.min(
    Math.max(previousSeedState?.sourceMessageCount || 0, 0),
    sourceMessages.length,
  );
  const cycleMessages = sourceMessages.slice(cycleStartIndex);
  const cycleUserMessages = cycleMessages
    .filter((message) => message.role === "user" && message.type === "userSendMessage")
    .map(cloneChatMessage);

  const latestTaskCheckpoint = [...cycleMessages]
    .reverse()
    .find(
      (message) =>
        isCheckpointMessage(message) &&
        message.content.startsWith("[Checkpoint]") &&
        message.content.includes("类型：task_complete"),
    );

  let completionMessage: ChatMessage | null = latestTaskCheckpoint
    ? cloneChatMessage(latestTaskCheckpoint)
    : null;

  if (!completionMessage) {
    const lastCompleteTaskResultIndex = cycleMessages.findLastIndex((message) => {
      const payload = parseToolResultMessage(message);
      return payload?.toolName === "completeTask";
    });

    if (lastCompleteTaskResultIndex >= 0) {
      const resultMessage = cycleMessages[lastCompleteTaskResultIndex]!;
      const resultPayload = parseToolResultMessage(resultMessage);
      const previousMessage =
        lastCompleteTaskResultIndex > 0
          ? cycleMessages[lastCompleteTaskResultIndex - 1]
          : undefined;
      const callPayload = previousMessage ? parseAssistantToolCallMessage(previousMessage) : null;
      const summary =
        resultPayload?.summary?.trim() ||
        (typeof callPayload?.arguments?.summary === "string"
          ? callPayload.arguments.summary.trim()
          : "") ||
        "任务已完成";
      const result =
        normalizeCompletionResultText(resultPayload?.result) ||
        (typeof callPayload?.arguments?.result === "string"
          ? callPayload.arguments.result.trim()
          : "") ||
        summary;

      completionMessage = {
        role: "user",
        type: "checkpoint",
        partial: false,
        content: buildCheckpointMessage({
          kind: "task_complete",
          summary,
          result,
        }),
      };
    }
  }

  if (cycleUserMessages.length === 0 && !completionMessage) {
    return previousSeedState || null;
  }

  return {
    sourceMessageCount: sourceMessages.length,
    messages: [
      ...(previousSeedState?.messages || []).map(cloneChatMessage),
      ...cycleUserMessages,
      ...(completionMessage ? [completionMessage] : []),
    ],
  };
};

/**
 * 会话
 */
export class Conversation {
  readonly id: string;
  readonly memory: FilePersistedMemory;
  readonly toolService: ToolService;
  llm: AmigoLlm;
  readonly parentId?: string;

  private _userInput = "";
  private _isAborted = false;
  private _pendingToolCall: PendingToolCall | null = null;
  private _lastCompleteTaskDisposition: "phase_advanced" | "task_completed" | null = null;

  private constructor(params: {
    id: string;
    memory: FilePersistedMemory;
    toolService: ToolService;
    llm: AmigoLlm;
    parentId?: string;
  }) {
    this.id = params.id;
    this.memory = params.memory;
    this.toolService = params.toolService;
    this.llm = params.llm;
    this.parentId = params.parentId;
  }

  private syncAutoApproveToolNamesToTaskStatus(toolNames: string[] = []): void {
    this.memory.setAutoApproveToolNames([
      ...normalizeAutoApproveToolNames(toolNames),
      ...this.memory.autoApproveToolNames,
      ...getConfiguredAutoApproveToolNames(),
    ]);
  }

  public broadcastTaskStatusMapUpdated(): void {
    const message: WebSocketMessage<"taskStatusMapUpdated"> = {
      type: "taskStatusMapUpdated",
      data: {
        taskId: this.id,
        executionTasks: this.memory.executionTasks,
        autoApproveToolNames: this.memory.autoApproveToolNames,
        contextUsage: this.memory.contextUsage,
        context: this.memory.context,
        workflowState: this.workflowState,
      } satisfies TaskStatusMapUpdatedData,
    };
    broadcaster.broadcast(this.id, message);
  }

  public setAutoApproveToolNames(toolNames: string[]): void {
    this.memory.setAutoApproveToolNames(normalizeAutoApproveToolNames(toolNames));
    this.broadcastTaskStatusMapUpdated();
  }

  public setContextUsage(contextUsage: ContextUsageStatus | undefined): void {
    this.memory.setContextUsage(contextUsage);
    this.broadcastTaskStatusMapUpdated();
  }

  public get workflowState(): WorkflowState {
    const normalized = normalizeWorkflowState(
      this.memory.workflowState,
      this.resolveWorkflowFallbackState(),
    );
    const persisted = this.memory.workflowState;
    if (!persisted || JSON.stringify(persisted) !== JSON.stringify(normalized)) {
      this.memory.setWorkflowState(normalized);
    }
    return normalized;
  }

  public get currentWorkflowPhase(): WorkflowPhase {
    return this.workflowState.currentPhase;
  }

  public get workflowAgentRole(): WorkflowAgentRole {
    return this.workflowState.agentRole;
  }

  public setWorkflowState(
    workflowState: WorkflowState,
    options?: { announce?: boolean; forceAnnouncement?: boolean },
  ): void {
    const normalized = normalizeWorkflowState(workflowState);
    const previous = this.memory.workflowState;
    const phaseChanged =
      previous?.currentPhase !== normalized.currentPhase ||
      previous?.agentRole !== normalized.agentRole;

    this.memory.setWorkflowState(normalized);
    if (options?.announce || phaseChanged) {
      announceWorkflowState({
        memory: this.memory,
        workflowState: this.workflowState,
        force: !!options?.forceAnnouncement,
      });
    }
    this.broadcastTaskStatusMapUpdated();
  }

  public advanceWorkflowPhase(targetPhase: WorkflowPhase): void {
    this.setWorkflowState(transitionWorkflowState(this.workflowState, targetPhase, "advance"));
  }

  public skipWorkflowPhase(
    targetPhase: WorkflowPhase,
    metadata: { reason?: string; evidence?: string } = {},
  ): void {
    this.setWorkflowState(
      transitionWorkflowState(this.workflowState, targetPhase, "skip", metadata),
    );
  }

  public changeWorkflowPhase(
    targetPhase: WorkflowPhase,
    metadata: { reason?: string; evidence?: string } = {},
    options?: { mode?: WorkflowMode },
  ): void {
    const nextState = transitionWorkflowState(this.workflowState, targetPhase, "change", metadata, {
      phaseSequence: CONTROLLER_DEFAULT_WORKFLOW_PHASE_SEQUENCE,
    });
    this.setWorkflowState({
      ...nextState,
      ...(options?.mode ? { mode: options.mode } : {}),
    });
  }

  public restartMainWorkflowCycleForNextUserTurn(): void {
    if (this.parentId || this.workflowAgentRole !== "controller") {
      return;
    }

    const taskListPath = getTaskListPath(this.id);
    if (existsSync(taskListPath)) {
      rmSync(taskListPath, { force: true });
    }

    this.memory.clearAllExecutionTasks();
    this.pendingToolCall = null;
    this.setContextUsage(undefined);
    this.setWorkflowState(createWorkflowState(), {
      announce: true,
      forceAnnouncement: true,
    });

    broadcaster.broadcast(this.id, {
      type: "taskStatusMapUpdated",
      data: {
        taskId: this.id,
        executionTasks: this.memory.executionTasks,
        autoApproveToolNames: this.memory.autoApproveToolNames,
        contextUsage: this.memory.contextUsage,
        context: this.memory.context,
        workflowState: this.workflowState,
      } satisfies TaskStatusMapUpdatedData,
    });
  }

  public restartMainWorkflowCycleForNextUserTurnWithState(
    workflowState: WorkflowState,
    options?: { preserveCompletionSeedHistory?: boolean },
  ): void {
    if (this.parentId || this.workflowAgentRole !== "controller") {
      return;
    }

    const completionSeedState = options?.preserveCompletionSeedHistory
      ? collectSeedHistoryFromLastCompletion(this.memory)
      : null;

    const taskListPath = getTaskListPath(this.id);
    if (existsSync(taskListPath)) {
      rmSync(taskListPath, { force: true });
    }

    this.memory.clearAllExecutionTasks();
    this.pendingToolCall = null;
    this.setContextUsage(undefined);
    this.setWorkflowState(
      {
        ...workflowState,
        ...(completionSeedState ? { completionSeedState } : {}),
      },
      {
        announce: true,
        forceAnnouncement: true,
      },
    );

    broadcaster.broadcast(this.id, {
      type: "taskStatusMapUpdated",
      data: {
        taskId: this.id,
        executionTasks: this.memory.executionTasks,
        autoApproveToolNames: this.memory.autoApproveToolNames,
        contextUsage: this.memory.contextUsage,
        context: this.memory.context,
        workflowState: this.workflowState,
      } satisfies TaskStatusMapUpdatedData,
    });
  }

  public setLlm(llm: AmigoLlm): void {
    this.llm = llm;
  }

  get status(): ConversationStatus {
    return this.memory.conversationStatus;
  }

  set status(value: ConversationStatus) {
    this.memory.conversationStatus = value;
  }

  get userInput(): string {
    return this._userInput;
  }

  set userInput(value: string) {
    this._userInput = value;
  }

  get isAborted(): boolean {
    return this._isAborted;
  }

  set isAborted(value: boolean) {
    this._isAborted = value;
  }

  get pendingToolCall(): PendingToolCall | null {
    return this._pendingToolCall;
  }

  set pendingToolCall(value: PendingToolCall | null) {
    this._pendingToolCall = value;
    this.memory.setPendingToolCall(value);
  }

  get isNew(): boolean {
    return this.memory.isNewSession();
  }

  public setLastCompleteTaskDisposition(
    disposition: "phase_advanced" | "task_completed" | null,
  ): void {
    this._lastCompleteTaskDisposition = disposition;
  }

  public consumeLastCompleteTaskDisposition(): "phase_advanced" | "task_completed" | null {
    const disposition = this._lastCompleteTaskDisposition;
    this._lastCompleteTaskDisposition = null;
    return disposition;
  }

  private resolveWorkflowFallbackState(options?: {
    allowLegacyWorkerInference?: boolean;
  }): Partial<WorkflowState> {
    return resolveConversationWorkflowFallbackState({
      persistedWorkflowState: this.memory.workflowState,
      toolNames: this.memory.toolNames,
      parentId: this.parentId,
      allowLegacyWorkerInference: options?.allowLegacyWorkerInference,
    });
  }

  private static buildInitialSystemPrompt(
    toolService: ToolService,
    workflowState: Partial<WorkflowState> | undefined,
    customPrompt?: string,
    context?: unknown,
  ): string {
    return buildConversationSystemPrompt({
      toolService,
      workflowState,
      customPrompt,
      context,
    });
  }

  /**
   * 创建新会话
   */
  static create(params: {
    id?: string;
    toolService: ToolService;
    llm: AmigoLlm;
    parentId?: string;
    customPrompt?: string;
    context?: unknown;
    modelConfigSnapshot?: ModelConfigSnapshot;
    autoApproveToolNames?: string[];
    workflowState?: WorkflowState;
  }): Conversation {
    const id = params.id || uuidV4();
    const memory = new FilePersistedMemory(id, params.parentId);

    const conversation = new Conversation({
      id,
      memory,
      toolService: params.toolService,
      llm: params.llm,
      parentId: params.parentId,
    });

    if (params.context !== undefined) {
      memory.setContext(params.context);
    }
    if (params.modelConfigSnapshot) {
      memory.setModelConfigSnapshot(params.modelConfigSnapshot);
    }
    const normalizedWorkflowState = normalizeWorkflowState(
      params.workflowState,
      conversation.resolveWorkflowFallbackState(),
    );
    conversation.syncAutoApproveToolNamesToTaskStatus(params.autoApproveToolNames);

    // 初始化系统提示词
    const systemPrompt = Conversation.buildInitialSystemPrompt(
      params.toolService,
      normalizedWorkflowState,
      params.customPrompt,
      params.context,
    );
    memory.setInitialSystemPrompt(systemPrompt);

    const toolNames = params.toolService.getAllTools().map((tool) => tool.name);
    memory.setToolNames(toolNames);
    conversation.setWorkflowState(normalizedWorkflowState, {
      announce: true,
      forceAnnouncement: true,
    });

    return conversation;
  }

  /**
   * 更新执行任务状态并广播
   */
  public updateExecutionTaskStatus(description: string, status: ExecutionTaskStatus): void {
    const taskKey = getTaskId(description) || description;
    if (taskKey !== description && this.memory.executionTasks[description]) {
      this.memory.clearExecutionTask(description);
    }
    this.memory.updateExecutionTask(taskKey, {
      ...status,
      description: status.description ?? description,
    });

    this.broadcastTaskStatusMapUpdated();
  }

  /**
   * 清理执行任务状态
   */
  public clearExecutionTask(description: string): void {
    const taskKey = getTaskId(description) || description;
    this.memory.clearExecutionTask(taskKey);
    if (taskKey !== description) {
      this.memory.clearExecutionTask(description);
    }

    this.broadcastTaskStatusMapUpdated();
  }

  /**
   * 清理所有执行任务状态
   */
  public clearAllExecutionTasks(): void {
    this.memory.clearAllExecutionTasks();

    this.broadcastTaskStatusMapUpdated();
  }

  /**
   * 从已有 taskId 恢复会话
   */
  static fromTaskId(taskId: string, allCustomTools: ToolInterface<any>[]): Conversation {
    const { memory, llm, toolService } = buildRecoveredConversationRuntime(taskId, allCustomTools);

    const conversation = new Conversation({
      id: taskId,
      memory,
      toolService,
      llm,
      parentId: memory.getFatherTaskId,
    });
    conversation.syncAutoApproveToolNamesToTaskStatus();

    // 恢复 pendingToolCall
    if (memory.pendingToolCall) {
      conversation._pendingToolCall = memory.pendingToolCall;
    }

    const isNewSession = memory.isNewSession();

    // 如果是新会话（文件不存在或为空），注入 systemPrompt
    if (isNewSession) {
      const normalizedWorkflowState = normalizeWorkflowState(
        memory.workflowState,
        conversation.resolveWorkflowFallbackState({ allowLegacyWorkerInference: true }),
      );
      const systemPrompt = Conversation.buildInitialSystemPrompt(
        toolService,
        normalizedWorkflowState,
        undefined,
        memory.context,
      );
      memory.setInitialSystemPrompt(systemPrompt);

      const initialToolNames = toolService.getAllTools().map((tool) => tool.name);
      memory.setToolNames(initialToolNames);
    }

    conversation.setWorkflowState(
      normalizeWorkflowState(
        memory.workflowState,
        conversation.resolveWorkflowFallbackState({ allowLegacyWorkerInference: true }),
      ),
      { announce: true, forceAnnouncement: isNewSession },
    );

    return conversation;
  }
}
