import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  conversationOrchestrator,
  enqueueConversationContinuation,
  flushConversationContinuationsIfIdle,
} from "@/core/conversation";
import { sortTasksTopologically } from "@/core/templates/checklistParser";
import { logger } from "@/utils/logger";
import { createToolResult } from "../result";
import { resolveExecutionTaskFailureState, runTaskScheduler } from "./executeTaskListScheduler";
import {
  appendInternalExecutionSummary,
  buildExecutionMessage,
  buildPostExecuteContinuationReason,
  collectCompletedTaskIds,
  getParentConversation,
  type ParentConversation,
  readTaskList,
  resolveExecutionType,
  summarizeExecutionOutcomes,
  type TaskExecutionResult,
  validateTaskListFormat,
} from "./executeTaskListShared";
import { startNewTask } from "./executeTaskListTaskRunner";
import {
  buildTaskListMarkdown,
  ensureDirectoryExists,
  normalizeTaskListItems,
  parseTaskListFile,
} from "./utils";

const ACTIVE_CONVERSATION_STATUSES = new Set([
  "streaming",
  "tool_executing",
  "waiting_tool_confirmation",
]);

const buildTaskListError = (params: { message: string; taskId?: string; filePath?: string }) =>
  createToolResult(
    {
      success: false,
      taskId: params.taskId,
      filePath: params.filePath || "",
      markdown: "",
      tasks: [],
      message: params.message,
    },
    {
      transportMessage: params.message,
      continuationSummary: params.message,
      continuationResult: {
        success: false,
        message: params.message,
      },
    },
  );

const continueParentConversationIfNeeded = (parentConv: ParentConversation, reason: string) => {
  if (parentConv.workflowAgentRole !== "controller") return;
  if (parentConv.isAborted || parentConv.status === "aborted") return;
  if (ACTIVE_CONVERSATION_STATUSES.has(parentConv.status)) return;

  const applyExecutionContinuation = (conversation: ParentConversation) => {
    conversation.isAborted = false;
    conversation.memory.addMessage({
      role: "user",
      content: reason,
      type: "userSendMessage",
      partial: false,
    });
    conversation.userInput = reason;
  };

  enqueueConversationContinuation({
    conversation: parentConv,
    reason,
    run: async (conversation) => {
      applyExecutionContinuation(conversation);
      const executor = conversationOrchestrator.getExecutor(conversation.id);
      await executor.execute(conversation);
    },
    injectBeforeNextTurn: (conversation) => {
      applyExecutionContinuation(conversation as ParentConversation);
    },
  });
  void flushConversationContinuationsIfIdle(parentConv);
};

export const runTaskListAction = async ({
  params,
  context,
  resolvedTaskId,
  filePath,
  continuationSummary,
}: {
  params: { tasks?: unknown[] };
  context: {
    getToolByName: (name: string) => unknown;
    signal?: AbortSignal;
    getSandbox: () => Promise<unknown>;
    parentId?: string;
    postMessage?: (msg: string | object) => void;
  };
  resolvedTaskId: string;
  filePath: string;
  continuationSummary: string;
}) => {
  try {
    let wroteTaskList = false;
    if (Array.isArray(params.tasks)) {
      const normalized = normalizeTaskListItems(params.tasks);
      if (!normalized.tasks) {
        return buildTaskListError({
          message: normalized.message || "taskList 校验失败",
          taskId: resolvedTaskId,
          filePath,
        });
      }

      ensureDirectoryExists(filePath.replace(/\/[^/]+$/, ""));
      writeFileSync(filePath, buildTaskListMarkdown(normalized.tasks), "utf-8");
      wroteTaskList = true;
    } else if (!existsSync(filePath)) {
      return buildTaskListError({
        message: "execute 模式下必须提供 tasks，或先前已经存在可执行的 taskList。",
        taskId: resolvedTaskId,
        filePath,
      });
    }

    const { content: taskListContent, parseResult, pendingTasks } = readTaskList(filePath);
    const formatError = validateTaskListFormat(parseResult.items);
    if (formatError) {
      logger.warn(`[TaskList] ${formatError}`);
      return buildTaskListError({
        message: formatError,
        taskId: resolvedTaskId,
        filePath,
      });
    }

    if (pendingTasks.length === 0) {
      const markdown = taskListContent.replace(/\r\n/g, "\n");
      const tasks = parseTaskListFile(markdown);
      const msg = "taskList 中没有待执行任务";
      logger.info(`[TaskList] ${msg}`);
      return createToolResult(
        {
          success: true,
          taskId: resolvedTaskId,
          filePath,
          markdown,
          tasks,
          message: msg,
          status: "completed",
          taskListUpdated: wroteTaskList || undefined,
          pending: 0,
          executed: 0,
          successCount: 0,
          failedCount: 0,
          interruptedCount: 0,
          blockedCount: 0,
        },
        {
          transportMessage: msg,
          continuationSummary,
          continuationResult: {
            success: true,
            message: msg,
            status: "completed",
            pending: 0,
            executed: 0,
          },
        },
      );
    }

    const parentConv = getParentConversation(resolvedTaskId);
    const results: TaskExecutionResult[] = [];
    const runningTaskIds = new Set<string>();
    const completedTaskIds = collectCompletedTaskIds(parseResult.items);
    const allTasks = sortTasksTopologically(parseResult.items);
    logger.info(`[TaskList] 找到 ${pendingTasks.length} 个待执行任务，开始同步执行`);
    try {
      await runTaskScheduler({
        allTasks,
        runningTaskIds,
        completedTaskIds,
        getExecutionType: (taskItem) => resolveExecutionType(parentConv, taskItem).type,
        onRunTask: async (taskItem) => {
          const { type: executionType } = resolveExecutionType(parentConv, taskItem);
          const result = await startNewTask({
            taskItem,
            filePath,
            getToolByName: context.getToolByName as (name: string) => any,
            parentTaskId: resolvedTaskId,
            parentConv,
            executionType,
            completedTaskIds,
            allTasks,
          });
          results.push(result);
          return result;
        },
      });
    } catch (error) {
      const failureState = resolveExecutionTaskFailureState(error);
      const errorMsg = failureState.summary;
      logger.error(`[TaskList] ${errorMsg}`);
      appendInternalExecutionSummary(parentConv, errorMsg);
      continueParentConversationIfNeeded(
        parentConv,
        "taskList 执行出现错误，请基于最新错误信息继续处理并给出下一步动作。",
      );
      throw error;
    }

    const executionMsg = buildExecutionMessage({ results, pendingTasks });
    const { failedCount, interruptedCount, blockedCount, successCount } =
      summarizeExecutionOutcomes({
        results,
        pendingTasks,
      });
    const executionSucceeded = failedCount === 0 && interruptedCount === 0 && blockedCount === 0;
    const finalMarkdown = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
    const finalTasks = parseTaskListFile(finalMarkdown);

    logger.info(`[TaskList] ${executionMsg}`);
    appendInternalExecutionSummary(parentConv, executionMsg);
    continueParentConversationIfNeeded(
      parentConv,
      buildPostExecuteContinuationReason({
        taskListContent,
        results,
        pendingTasks,
      }),
    );

    return createToolResult(
      {
        success: executionSucceeded,
        taskId: resolvedTaskId,
        filePath,
        markdown: finalMarkdown,
        tasks: finalTasks,
        message: executionMsg,
        status: executionSucceeded ? "completed" : "partial",
        taskListUpdated: wroteTaskList || undefined,
        pending: pendingTasks.length,
        executed: results.length,
        successCount,
        failedCount,
        interruptedCount,
        blockedCount,
        executionResults: results,
      },
      {
        transportMessage: executionMsg,
        continuationSummary,
        continuationResult: {
          success: executionSucceeded,
          message: executionMsg,
          status: executionSucceeded ? "completed" : "partial",
          pending: pendingTasks.length,
          executed: results.length,
          successCount,
          failedCount,
          interruptedCount,
          blockedCount,
          taskListUpdated: wroteTaskList || undefined,
        },
      },
    );
  } catch (error) {
    const errorMsg = `执行 taskList 失败: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(`[TaskList] ${errorMsg}`);
    return buildTaskListError({
      message: errorMsg,
      taskId: resolvedTaskId,
      filePath,
    });
  }
};
