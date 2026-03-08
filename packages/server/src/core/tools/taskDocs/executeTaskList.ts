import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ToolInterface } from "@amigo-llm/types";
import { taskOrchestrator } from "@/core/conversation";
import { conversationRepository } from "@/core/conversation/ConversationRepository";
import {
  getTaskId,
  parseChecklist,
  sortTasksTopologically,
  updateChecklistItemContent,
  updateProgressSection,
} from "@/core/templates/checklistParser"; // 导入拓扑排序函数
import { logger } from "@/utils/logger";
import { createTool } from "../base";
import { buildDependencyResultContext } from "./dependencyContext";
import { getTaskDocsPath, parseToolsFromDescription } from "./utils";

const CONCURRENCY_LIMIT = 2;
const DOC_TRUNCATE_LIMIT = 4000;
const FORBIDDEN_SUB_TASK_TOOLS = [
  "createTaskDocs",
  "readTaskDocs",
  "getTaskListProgress",
  "executeTaskList",
];
const activeTaskListExecutionMap = new Map<string, string>();

const normalizeDescription = (description: string) =>
  description.replace(/\(In Progress\)$/, "").trim();

const getTaskKey = (description: string) => getTaskId(description) || description;

const createExecutionId = () => `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const readDocIfExists = (filePath: string) => {
  if (!existsSync(filePath)) return "";
  return readFileSync(filePath, "utf-8");
};

const loadTaskDocs = (taskDocsPath: string, taskListContent: string) => ({
  requirements: readDocIfExists(path.join(taskDocsPath, "requirements.md")),
  design: readDocIfExists(path.join(taskDocsPath, "design.md")),
  taskList: taskListContent,
});

const trimDoc = (content: string, limit = DOC_TRUNCATE_LIMIT) => {
  const safeContent = content?.trim() || "";
  if (safeContent.length <= limit) return safeContent;
  return `${safeContent.slice(0, limit)}\n...（内容过长已截断）`;
};

const formatDocSection = (title: string, content: string) =>
  `### ${title}\n${content ? trimDoc(content) : "无"}`;

const updateTaskListStatus = (
  filePath: string,
  lineNumber: number,
  description: string,
  completed: boolean,
) => {
  const currentContent = readFileSync(filePath, "utf-8");
  const updated = updateChecklistItemContent(currentContent, lineNumber, description, completed);
  const final = updateProgressSection(updated);
  writeFileSync(filePath, final, "utf-8");
};

const markTaskInProgress = (filePath: string, lineNumber: number, description: string) => {
  if (description.includes("(In Progress)")) return;
  const currentContent = readFileSync(filePath, "utf-8");
  const updated = updateChecklistItemContent(
    currentContent,
    lineNumber,
    `${description} (In Progress)`,
    false,
  );
  writeFileSync(filePath, updated, "utf-8");
};

const resolveRequestedTools = (
  cleanDescriptionForAgent: string,
  getToolByName: (name: string) => ToolInterface<any> | undefined,
) => {
  const { cleanDescription, tools: requestedTools } =
    parseToolsFromDescription(cleanDescriptionForAgent);

  const availableTools: ToolInterface<any>[] = [];
  const invalidTools: string[] = [];
  const forbiddenTools: string[] = [];

  for (const toolName of requestedTools) {
    if (FORBIDDEN_SUB_TASK_TOOLS.includes(toolName)) {
      forbiddenTools.push(toolName);
      continue;
    }
    const tool = getToolByName(toolName);
    if (tool) {
      availableTools.push(tool);
    } else {
      invalidTools.push(toolName);
    }
  }

  return { cleanDescription, requestedTools, availableTools, invalidTools, forbiddenTools };
};

const buildSubAgentPrompt = ({
  cleanDescription,
  availableTools,
  forbiddenTools,
  dependencyResults,
  parentDocs,
  taskItem,
}: {
  cleanDescription: string;
  availableTools: ToolInterface<any>[];
  forbiddenTools: string[];
  dependencyResults: string;
  parentDocs: { requirements: string; design: string; taskList: string };
  taskItem: ReturnType<typeof parseChecklist>["items"][number];
}) => {
  const docsBlock = [
    formatDocSection("Requirements", parentDocs.requirements),
    formatDocSection("Design", parentDocs.design),
    formatDocSection("Task List", parentDocs.taskList),
  ].join("\n\n");

  return `你是一个专业的任务执行代理。
**任务目标：** ${cleanDescription}
**任务条目（父任务 taskList 原文）：** ${taskItem.rawLine?.trim() || cleanDescription}
**可用工具：** ${availableTools.length > 0 ? availableTools.map((t) => t.name).join(", ") : "基础工具"}
${forbiddenTools.length > 0 ? `\n⚠️ **警告：** 任务描述中请求了禁止的工具：${forbiddenTools.join(", ")}。子任务不允许再次分配任务。\n` : ""}
**父任务文档（必须阅读并参考）：**
${docsBlock}
${dependencyResults ? `\n**依赖任务 completeTask 结果（必须参考）：**\n${dependencyResults}` : ""}
**协作约束：**
- 必须遵循 design.md 中的 "SubTask Collaboration Contract"（过程文档位置、命名规范、输入输出、交接规范）。
- 主任务是协作规范唯一来源；若有冲突，以父任务文档与当前 taskList 条目为准。
**执行要求：**
1. 只完成当前任务，避免重新拆分
2. 参考父任务文档中的要求与设计，并按协作契约执行
3. 使用提供的工具
4. 完成后使用 completeTask 返回结果`;
};

const getExistingSubTaskStatus = (
  parentConv: NonNullable<ReturnType<typeof conversationRepository.load>>,
  taskKey: string,
  description: string,
) => {
  return parentConv.memory.subTasks[taskKey] || parentConv.memory.subTasks[description];
};

type TaskExecutionType = "failed" | "running" | "new" | "wait_review";

const resolveExecutionType = (
  parentConv: NonNullable<ReturnType<typeof conversationRepository.load>>,
  taskItem: ReturnType<typeof parseChecklist>["items"][number],
) => {
  const cleanDescription = normalizeDescription(taskItem.description);
  const taskKey = getTaskKey(cleanDescription);
  const status =
    getExistingSubTaskStatus(parentConv, taskKey, cleanDescription) ||
    parentConv.memory.subTasks[taskItem.description];

  if (status?.status === "failed") return { type: "failed" as const, status };
  if (status?.status === "running") return { type: "running" as const, status };
  if (status?.status === "wait_review") return { type: "wait_review" as const, status };
  return { type: "new" as const, status };
};

const startNewTask = ({
  taskItem,
  filePath,
  getToolByName,
  parentDocs,
  taskListContent,
  parentConv,
  executionType,
  taskId,
  completedTaskIds,
  allTasks,
}: {
  taskItem: ReturnType<typeof parseChecklist>["items"][number];
  filePath: string;
  getToolByName: (name: string) => ToolInterface<any> | undefined;
  parentDocs: { requirements: string; design: string; taskList: string };
  taskListContent: string;
  parentConv: NonNullable<ReturnType<typeof conversationRepository.load>>;
  executionType: TaskExecutionType;
  taskId: string;
  completedTaskIds: Set<string>;
  allTasks: ReturnType<typeof parseChecklist>["items"];
}) => {
  return (async (): Promise<TaskExecutionResult> => {
    const { description, lineNumber } = taskItem;
    let taskSucceeded = false;
    try {
      markTaskInProgress(filePath, lineNumber, description);
    } catch (e) {
      logger.error(`[ExecuteTaskList] 标记任务开始失败: ${e}`);
    }

    const cleanDescriptionForAgent = normalizeDescription(description);
    const { cleanDescription, availableTools, invalidTools, forbiddenTools } =
      resolveRequestedTools(cleanDescriptionForAgent, getToolByName);
    const taskKey = getTaskKey(cleanDescriptionForAgent);
    const existingStatus =
      getExistingSubTaskStatus(parentConv, taskKey, cleanDescriptionForAgent) ||
      parentConv.memory.subTasks[description];

    if (existingStatus?.subTaskId && (executionType === "failed" || executionType === "running")) {
      const existingConversation = conversationRepository.load(existingStatus.subTaskId);
      if (existingConversation && !["aborted", "completed"].includes(existingConversation.status)) {
        logger.info(
          `[ExecuteTaskList] 重新执行 ${executionType} 任务，先中断旧子任务: ${existingStatus.subTaskId}`,
        );
        taskOrchestrator.interrupt(existingConversation);
      }
    }

    const reuseSubTaskId =
      executionType === "new" &&
      existingStatus?.subTaskId &&
      existingStatus.status !== "completed" &&
      existingStatus.status !== "failed" &&
      existingStatus.status !== "running"
        ? existingStatus.subTaskId
        : undefined;

    if (invalidTools.length > 0) {
      logger.warn(
        `[ExecuteTaskList] 任务 "${cleanDescription}" 请求了不存在的工具: ${invalidTools.join(", ")}`,
      );
    }

    const dependencyResults = buildDependencyResultContext({
      dependencies: taskItem.dependencies,
      parentConversation: parentConv,
    });
    const subAgentPrompt = buildSubAgentPrompt({
      cleanDescription,
      availableTools,
      forbiddenTools,
      dependencyResults,
      parentDocs,
      taskItem,
    });

    let summary: string;
    try {
      const result = await taskOrchestrator.runSubTask({
        subPrompt: subAgentPrompt,
        parentId: taskId,
        target: cleanDescription,
        tools: availableTools,
        taskDescription: cleanDescriptionForAgent,
        subTaskId: reuseSubTaskId,
      });
      summary = result.result;
      taskSucceeded = true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      summary = `任务执行失败: ${errorMsg}`;
      parentConv.updateSubTaskStatus(cleanDescriptionForAgent, {
        status: "failed",
        error: errorMsg,
        completedAt: new Date().toISOString(),
      });
    }

    try {
      updateTaskListStatus(filePath, lineNumber, cleanDescriptionForAgent, taskSucceeded);
    } catch (e) {
      logger.error(`[ExecuteTaskList] 更新任务状态失败: ${e}`);
    }

    const id = getTaskId(cleanDescriptionForAgent);
    if (id && taskSucceeded) completedTaskIds.add(id);

    return {
      target: cleanDescription,
      success: taskSucceeded,
      summary,
      invalidTools: invalidTools.length > 0 ? invalidTools : undefined,
    };
  })();
};

const toolError = (message: string) => ({
  message,
  toolResult: {
    success: false,
    message,
  },
});

const toolSuccess = (message: string, extra?: Record<string, any>) => ({
  message,
  toolResult: {
    success: true,
    message,
    ...extra,
  },
});

const readTaskList = (filePath: string) => {
  const content = readFileSync(filePath, "utf-8");
  const parseResult = parseChecklist(content);
  const pendingTasks = parseResult.items.filter((item) => !item.completed);
  return { content, parseResult, pendingTasks };
};

const validateTaskListFormat = (items: ReturnType<typeof parseChecklist>["items"]) => {
  const invalidItems = items.filter((item) => !getTaskId(item.description));
  const idCounts = new Map<string, number>();

  for (const item of items) {
    const id = getTaskId(item.description);
    if (!id) continue;
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }

  const duplicatedIds = Array.from(idCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  if (invalidItems.length === 0 && duplicatedIds.length === 0) {
    return null;
  }

  const invalidDetails = invalidItems
    .map((item) => `- L${item.lineNumber + 1}: ${item.rawLine.trim()}`)
    .join("\n");

  const duplicateDetails =
    duplicatedIds.length > 0 ? `\n重复的 Task ID: ${duplicatedIds.join(", ")}` : "";

  return `taskList 格式错误：请确保每条任务使用 "Task X.Y:" 格式，并且 ID 唯一。\n${invalidItems.length > 0 ? `以下行缺少 Task ID：\n${invalidDetails}` : ""}${duplicateDetails}\n示例：- [ ] Task 1.1: 描述 [tools: editFile] [deps: Task 1.0]`;
};

const getParentConversation = (taskId: string) => {
  const parentConv = conversationRepository.load(taskId);
  if (!parentConv) {
    throw new Error(`未找到父会话，任务ID：${taskId}`);
  }
  return parentConv;
};

const collectCompletedTaskIds = (items: ReturnType<typeof parseChecklist>["items"]) => {
  const completedTaskIds = new Set<string>();
  for (const item of items) {
    if (!item.completed) continue;
    const id = getTaskId(item.description);
    if (id) completedTaskIds.add(id);
  }
  return completedTaskIds;
};

const getTaskPriority = (executionType: TaskExecutionType) => {
  if (executionType === "failed") return 0;
  if (executionType === "running") return 1;
  if (executionType === "wait_review") return 3;
  return 2;
};

type TaskExecutionResult = {
  target: string;
  success: boolean;
  summary: string;
  invalidTools?: string[];
};

const isTaskReady = ({
  item,
  completedTaskIds,
  runningTaskIds,
}: {
  item: ReturnType<typeof parseChecklist>["items"][number];
  completedTaskIds: Set<string>;
  runningTaskIds: Set<string>;
}) => {
  const id = getTaskId(item.description);
  if (!id) return false;
  if (item.completed) return false;
  if (completedTaskIds.has(id)) return false;
  if (runningTaskIds.has(id)) return false;
  if (item.dependencies && item.dependencies.length > 0) {
    return item.dependencies.every((depId) => completedTaskIds.has(depId));
  }
  return true;
};

const runWithConcurrency = async <T>(
  tasks: T[],
  worker: (task: T) => Promise<void>,
  concurrency = CONCURRENCY_LIMIT,
) => {
  if (tasks.length === 0) return;
  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < tasks.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const task = tasks[currentIndex];
        if (task === undefined) continue;
        await worker(task);
      }
    }),
  );
};

const runTaskScheduler = async ({
  allTasks,
  runningTaskIds,
  completedTaskIds,
  getExecutionType,
  onRunTask,
}: {
  allTasks: ReturnType<typeof parseChecklist>["items"];
  runningTaskIds: Set<string>;
  completedTaskIds: Set<string>;
  getExecutionType: (item: ReturnType<typeof parseChecklist>["items"][number]) => TaskExecutionType;
  onRunTask: (
    taskItem: ReturnType<typeof parseChecklist>["items"][number],
  ) => Promise<TaskExecutionResult>;
}) => {
  const pendingTaskMap = new Map<string, ReturnType<typeof parseChecklist>["items"][number]>();
  for (const item of allTasks) {
    const id = getTaskId(item.description);
    if (!id || item.completed || completedTaskIds.has(id)) continue;
    pendingTaskMap.set(id, item);
  }

  while (pendingTaskMap.size > 0) {
    const readyTasks = Array.from(pendingTaskMap.values())
      .filter((item) => {
        if (!isTaskReady({ item, completedTaskIds, runningTaskIds })) {
          return false;
        }
        return getExecutionType(item) !== "wait_review";
      })
      .sort((a, b) => {
        const priorityDiff =
          getTaskPriority(getExecutionType(a)) - getTaskPriority(getExecutionType(b));
        if (priorityDiff !== 0) return priorityDiff;
        return (
          (a.lineNumber ?? Number.POSITIVE_INFINITY) - (b.lineNumber ?? Number.POSITIVE_INFINITY)
        );
      });

    if (readyTasks.length === 0) {
      break;
    }

    await runWithConcurrency(readyTasks, async (taskItem) => {
      const id = getTaskId(taskItem.description);
      if (!id) return;
      runningTaskIds.add(id);
      try {
        await onRunTask(taskItem);
      } finally {
        runningTaskIds.delete(id);
        pendingTaskMap.delete(id);
      }
    });
  }
};

const buildExecutionMessage = ({
  results,
  pendingTasks,
}: {
  results: TaskExecutionResult[];
  pendingTasks: ReturnType<typeof parseChecklist>["items"];
}) => {
  const hasInvalidTools = results.some((r) => r.invalidTools);
  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;
  const blockedCount = Math.max(0, pendingTasks.length - successCount - failedCount);

  let warningMessage = hasInvalidTools
    ? "\n⚠️ 警告：部分任务请求了不存在的工具，这些工具已被忽略。"
    : "";

  if (failedCount > 0) {
    warningMessage += `\n⚠️ 警告：有 ${failedCount} 个任务执行失败，已保留为未完成，可修复后重新调用 executeTaskList 重试。`;
  }

  if (blockedCount > 0) {
    warningMessage += `\n⚠️ 警告：有 ${blockedCount} 个任务未被执行（可能处于待审核、依赖未满足或配置错误）。`;
  }

  return `✅ 自动执行完成（成功 ${successCount}/${pendingTasks.length}，失败 ${failedCount}）${warningMessage}\n\n${results
    .map(
      (r, i) =>
        `任务 ${i + 1}: ${r.target}\n状态: ${r.success ? "成功" : "失败"}\n结果: ${r.summary}${r.invalidTools ? `\n⚠️ 无效工具: ${r.invalidTools.join(", ")}` : ""}`,
    )
    .join("\n\n")}`;
};

const continueParentConversationIfNeeded = (
  parentConv: NonNullable<ReturnType<typeof conversationRepository.load>>,
  reason: string,
) => {
  if (parentConv.type !== "main") return;
  if (parentConv.isAborted || parentConv.status === "aborted") return;
  if (parentConv.status !== "idle") return;

  parentConv.isAborted = false;
  parentConv.memory.addMessage({
    role: "user",
    content: reason,
    type: "userSendMessage",
    partial: false,
  });
  parentConv.userInput = reason;

  const executor = taskOrchestrator.getExecutor(parentConv.id);
  void executor.execute(parentConv);
};

const appendInternalExecutionSummary = (
  parentConv: NonNullable<ReturnType<typeof conversationRepository.load>>,
  summary: string,
) => {
  parentConv.memory.addMessage({
    role: "system",
    content: `executeTaskList 异步执行结果（内部上下文，请据此继续推进主任务）:\n\n${summary}`,
    type: "system",
    partial: false,
  });
};

/**
 * 执行任务列表工具
 * 用于根据 taskList.md 中的任务自动执行子任务
 * 支持中断恢复功能
 */
export const ExecuteTaskList = createTool({
  name: "executeTaskList",
  description: "根据当前任务的 taskList.md 自动调度子 Agent 执行任务。支持任务进度追踪和中断恢复。",
  whenToUse:
    "在 taskList 已确认后启动异步批量执行时使用；也可用于中断/失败后的续跑。调用后应告知用户系统会后台推进并自动推送结果。",

  params: [],

  async invoke({ context }) {
    const { taskId, getToolByName } = context;

    if (!taskId) {
      return toolError("taskId 不能为空");
    }

    const taskDocsPath = getTaskDocsPath(taskId as string);
    const filePath = path.join(taskDocsPath, "taskList.md");

    try {
      if (!existsSync(filePath)) {
        return toolError(`任务列表文件不存在: ${filePath}`);
      }

      const { content: taskListContent, parseResult, pendingTasks } = readTaskList(filePath);
      const formatError = validateTaskListFormat(parseResult.items);
      if (formatError) {
        logger.warn(`[ExecuteTaskList] ${formatError}`);
        return toolError(formatError);
      }

      if (pendingTasks.length === 0) {
        const msg = "taskList 中没有待执行任务";
        logger.info(`[ExecuteTaskList] ${msg}`);
        return toolSuccess(msg, { executed: false });
      }

      const executionId = createExecutionId();
      const existingExecutionId = activeTaskListExecutionMap.get(taskId as string);
      if (existingExecutionId) {
        const msg = `任务列表已在执行中（执行编号: ${existingExecutionId}）`;
        logger.info(`[ExecuteTaskList] ${msg}`);
        return toolSuccess(msg, {
          executed: false,
          alreadyRunning: true,
          executionId: existingExecutionId,
        });
      }

      const startedAt = new Date().toISOString();
      const parentDocs = loadTaskDocs(taskDocsPath, taskListContent);

      const parentConv = getParentConversation(taskId as string);
      activeTaskListExecutionMap.set(taskId as string, executionId);
      logger.info(`[ExecuteTaskList] 找到 ${pendingTasks.length} 个待执行任务，开始自动执行`);

      const results: TaskExecutionResult[] = [];
      const runningTaskIds = new Set<string>();
      const completedTaskIds = collectCompletedTaskIds(parseResult.items);
      const allTasks = sortTasksTopologically(parseResult.items);

      const runAsync = async () => {
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
                getToolByName,
                parentDocs,
                taskListContent,
                parentConv,
                executionType,
                taskId: taskId as string,
                completedTaskIds,
                allTasks: parseResult.items,
              });
              results.push(result);
              return result;
            },
          });

          const executionMsg = buildExecutionMessage({ results, pendingTasks });
          logger.info(`[ExecuteTaskList] ${executionMsg}`);
          appendInternalExecutionSummary(parentConv, executionMsg);
          continueParentConversationIfNeeded(
            parentConv,
            "executeTaskList 异步执行已完成，请基于最新 taskList 和执行结果继续推进任务；若全部完成请直接总结给用户。",
          );
        } catch (error) {
          const errorMsg = `执行任务列表失败: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(`[ExecuteTaskList] ${errorMsg}`);
          appendInternalExecutionSummary(parentConv, errorMsg);
          continueParentConversationIfNeeded(
            parentConv,
            "executeTaskList 异步执行出现错误，请基于最新错误信息继续处理并给出下一步动作。",
          );
        } finally {
          const activeExecutionId = activeTaskListExecutionMap.get(taskId as string);
          if (activeExecutionId === executionId) {
            activeTaskListExecutionMap.delete(taskId as string);
          }
        }
      };

      void runAsync();

      const startedMsg = `已启动异步执行（${pendingTasks.length} 个任务），执行编号: ${executionId}`;
      return {
        message: startedMsg,
        toolResult: {
          success: true,
          message: startedMsg,
          executionId,
          startedAt,
          pending: pendingTasks.length,
        },
      };
    } catch (error) {
      const errorMsg = `执行任务列表失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[ExecuteTaskList] ${errorMsg}`);

      return toolError(errorMsg);
    }
  },
});
