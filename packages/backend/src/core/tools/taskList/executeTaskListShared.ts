import { readFileSync, writeFileSync } from "node:fs";
import type { ToolInterface } from "@amigo-llm/types";
import { conversationRepository } from "@/core/conversation/ConversationRepository";
import {
  getTaskId,
  parseChecklist,
  updateChecklistItemContent,
  updateProgressSection,
} from "@/core/templates/checklistParser";
import { createToolResult } from "../result";
import { getTaskListPath, parseToolsFromDescription } from "./utils";

export type GenericTool = ToolInterface<string>;

export const CONCURRENCY_LIMIT = 2;
export const MAX_SUB_TASK_AUTO_RETRIES = 2;
export const MAX_INTERNAL_REVIEW_ROUNDS = 2;
export const FORBIDDEN_SUB_TASK_TOOLS = ["taskList"];
export const EXECUTION_WORKER_BASE_TOOL_NAMES = [
  "editFile",
  "listFiles",
  "readFile",
  "bash",
  "finishPhase",
  "updateDevServer",
] as const;
export const OPTIONAL_EXECUTION_WORKER_LANGUAGE_TOOL_NAMES = [
  "goToDefinition",
  "findReferences",
  "getDiagnostics",
] as const;
export const EXECUTE_TASK_LIST_CONTINUATION_SUMMARY = "【执行阶段进行中】";

export type ParentConversation = NonNullable<ReturnType<typeof conversationRepository.load>>;

export type TaskExecutionType = "failed" | "running" | "new";

export type TaskExecutionResult = {
  target: string;
  success: boolean;
  outcome: "success" | "failed" | "interrupted";
  summary: string;
  ignoredLegacyTools?: string[];
};

export type TaskVerificationResult = {
  outcome: TaskExecutionResult["outcome"];
  summary: string;
  taskSucceeded: boolean;
  validationReason?: string;
};

export const normalizeDescription = (description: string) =>
  description.replace(/\(In Progress\)$/, "").trim();

export const getTaskKey = (description: string) => getTaskId(description) || description;

export const updateExecutionTaskStatus = (
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

export const markExecutionTaskInProgress = (
  filePath: string,
  lineNumber: number,
  description: string,
) => {
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

export const resolveExecutionWorkerTools = (
  cleanDescriptionForAgent: string,
  getToolByName: (name: string) => GenericTool | undefined,
) => {
  const { cleanDescription, tools: requestedTools } =
    parseToolsFromDescription(cleanDescriptionForAgent);

  const availableTools = OPTIONAL_EXECUTION_WORKER_LANGUAGE_TOOL_NAMES.map((toolName) =>
    getToolByName(toolName),
  ).filter((tool): tool is GenericTool => Boolean(tool));
  const availableToolNames = [
    ...EXECUTION_WORKER_BASE_TOOL_NAMES,
    ...availableTools.map((tool) => tool.name),
  ];
  const ignoredLegacyTools = requestedTools.filter(
    (toolName) => !FORBIDDEN_SUB_TASK_TOOLS.includes(toolName),
  );
  const forbiddenTools = requestedTools.filter((toolName) =>
    FORBIDDEN_SUB_TASK_TOOLS.includes(toolName),
  );

  return {
    cleanDescription,
    availableToolNames,
    availableTools,
    forbiddenTools,
    ignoredLegacyTools,
  };
};

export const buildSubAgentPrompt = ({
  cleanDescription,
  availableToolNames: _availableToolNames,
  forbiddenTools,
  ignoredLegacyTools,
  dependencyResults,
  taskListContext,
  taskItem,
  retryFeedback,
}: {
  cleanDescription: string;
  availableToolNames: string[];
  forbiddenTools: string[];
  ignoredLegacyTools: string[];
  dependencyResults: string;
  taskListContext: string;
  taskItem: ReturnType<typeof parseChecklist>["items"][number];
  retryFeedback?: string;
}) => {
  const lines = [
    "你是一个专业的任务执行代理。",
    `**任务目标：** ${cleanDescription}`,
    `**任务条目（父任务 taskList 原文）：** ${taskItem.rawLine?.trim() || cleanDescription}`,
  ];

  if (ignoredLegacyTools.length > 0) {
    lines.push(
      `ℹ️ **说明：** 任务条目中的旧版 \`[tools: ...]\` 配置（${ignoredLegacyTools.join(", ")}）会被忽略。子任务统一使用系统默认执行工具集。`,
    );
  }
  if (forbiddenTools.length > 0) {
    lines.push(
      `⚠️ **警告：** 任务描述中请求了禁止的工具：${forbiddenTools.join(", ")}。子任务不允许再次分配任务。`,
    );
  }
  if (dependencyResults) {
    lines.push(`**依赖任务结果（必须参考）：**\n${dependencyResults}`);
  }
  if (taskListContext) {
    lines.push(`**任务清单上下文（只读背景，不代表你要执行全部任务）：**\n${taskListContext}`);
  }

  lines.push(
    "**执行要求：**",
    "1. 你已经继承了父任务 design 以来的会话历史；先利用这些上下文，不要从头重复浏览。",
    "2. 整张 taskList 只是共享背景，不是你的待办列表；你的 scope 只由任务目标和当前 task line 决定。",
    "3. 只完成当前任务，不要顺手实现、验证、勾选或提前交付后续任务；即使你已经知道后续怎么做，也不要替它们动手。",
    "4. inherited history 是原始背景记录，不是空白起点；如果里面已经出现过目标文件、调查结论或工具输出，默认先复用，不要把同一批文件再读一遍。",
    "5. 代码内符号定位、定义追踪、引用分析优先用 `goToDefinition` / `findReferences` / `getDiagnostics`；尤其当诊断、编译错误或现有上下文已经给出 filePath + line + symbolName 时，不要先用 `bash rg` 反复搜同一批 symbol。典型链路：看到 `Cannot find name 'X'`，先用 `getDiagnostics` 确认锚点，再用 `goToDefinition` / `findReferences`，只有失败时才回退到 `bash/rg`。",
    "6. 查看文件内容只用 `readFile`；只有在 inherited history 缺少关键信息、需要读取此前未覆盖的文件，或信息可能过期时，才最小化调用 `readFile` / `listFiles` / `bash`。",
    "7. 修改文件只用 `editFile`；一旦已经知道要改哪个文件、改什么内容，就直接用 `editFile`，不要继续反复 `readFile` / `listFiles` / `bash`。",
    "7.5. 如果 inherited history、诊断结果或当前上下文已经足以确定下一步修改动作，下一步就直接调用对应推进工具；如果仍下不了手，就在 `finishPhase` 里明确说明卡点，让 controller 决定是否回到 design。不要围绕同一结论继续读文件。",
    "8. 若某一处修复已经明确且风险可控，就先改这一处，再继续诊断、验证或读取下一处；不要为了攒成一次大改而把其他相关文件都先读一遍。默认采用小步快跑、边改边验。",
    "9. 不要用 `bash` 编辑文件；`bash` 只用于 repo 级粗搜索、安装明确依赖、构建、测试和诊断。若只是代码符号导航，不要拿 `bash/rg` 代替 LSP。",
    "9.2. 如果检查明确提示 `node_modules missing`、缺少 CLI、`command not found` 或等价的依赖/工具链缺失信号，且包管理器与安装命令清楚，就直接用 `bash` 安装并重跑；不要把这类问题先上抛成 design。",
    "9.5. 已知源文件和缺失符号时，不要回退去读 `build/` 产物、生成文件或旧输出做对照；先改源文件，只有第一次 `editFile` 失败或源文件证据冲突时，才允许读取这些产物。",
    "10. 如果你在执行当前任务时发现问题类型、影响范围或关键约束已经明显超出当前 task scope，不要继续扩张读取和实现范围；在 `finishPhase` 的 `## 遗留问题` / `## 下游说明` 中明确写出新发现，让 controller 通过 `finishPhase(nextPhase=design)` 回到 design。",
    "11. 调用 `finishPhase` 时，`summary` 必须是 1-2 句话，`result` 必须包含且仅按这个标题输出四个非空章节：`## 交付物`、`## 验证`、`## 遗留问题`、`## 下游说明`。",
    "12. `## 验证` 必须优先写真实证据：先确认 LSP/diagnostics 是否 clean，再确认对应 build/lint/工程级检查结果，最后确认真实链路上的集成测试已经运行；不要只写“已自测”。",
    "13. 验证当前任务时，不要只跑孤立模块测试、纯单元测试或与主链路脱节的 mock 测试；测试必须和其他部分集成，能证明修改真的接入了目标链路。",
    "14. 只有在当前任务已经真正解决、并且已经完成必要自查时，才能使用 finishPhase。",
  );

  if (retryFeedback) {
    lines.push(`**上一次自动验收未通过，必须返工并修正以下问题：**\n${retryFeedback}`);
  }

  return lines.join("\n");
};

export const buildExecutionWorkerConversationContext = (
  taskItem: ReturnType<typeof parseChecklist>["items"][number],
  allTasks: ReturnType<typeof parseChecklist>["items"],
) => ({
  executionTask: {
    rawTaskLine: taskItem.rawLine?.trim() || taskItem.description,
    lineNumber: taskItem.lineNumber + 1,
    designSectionRefs: taskItem.designSectionRefs,
    fileRefs: taskItem.fileRefs,
    taskList: allTasks.map((item) => ({
      rawTaskLine: item.rawLine?.trim() || item.description,
      lineNumber: item.lineNumber + 1,
      completed: item.completed,
      dependencies: item.dependencies,
      isCurrent: item.lineNumber === taskItem.lineNumber,
    })),
  },
});

export const buildTaskListContext = ({
  allTasks,
  currentTaskLineNumber,
}: {
  allTasks: ReturnType<typeof parseChecklist>["items"];
  currentTaskLineNumber: number;
}) =>
  [
    "只把下面清单当成上下游参考。你只负责标记为 CURRENT 的这一项。",
    ...allTasks.map((item) => {
      const marker =
        item.lineNumber === currentTaskLineNumber ? "CURRENT" : item.completed ? "DONE" : "OTHER";
      const deps =
        item.dependencies.length > 0 ? ` | deps: ${item.dependencies.join(", ")}` : " | deps: none";
      return `- [${marker}] L${item.lineNumber + 1} ${item.rawLine?.trim() || item.description}${deps}`;
    }),
  ].join("\n");

export const getExistingExecutionTaskStatus = (
  parentConv: ParentConversation,
  taskKey: string,
  description: string,
) => parentConv.memory.executionTasks[taskKey] || parentConv.memory.executionTasks[description];

export const resolveExecutionType = (
  parentConv: ParentConversation,
  taskItem: ReturnType<typeof parseChecklist>["items"][number],
) => {
  const cleanDescription = normalizeDescription(taskItem.description);
  const taskKey = getTaskKey(cleanDescription);
  const status =
    getExistingExecutionTaskStatus(parentConv, taskKey, cleanDescription) ||
    parentConv.memory.executionTasks[taskItem.description];

  if (status?.status === "failed") return { type: "failed" as const, status };
  if (status?.status === "running") return { type: "running" as const, status };
  return { type: "new" as const, status };
};

export const toolError = (message: string) =>
  createToolResult(
    {
      success: false,
      message,
    },
    {
      transportMessage: message,
      continuationSummary: message,
      continuationResult: {
        success: false,
        message,
      },
    },
  );

export const toolSuccess = (message: string, extra?: Record<string, unknown>) =>
  createToolResult(
    {
      success: true,
      message,
      ...extra,
    },
    {
      transportMessage: message,
      continuationSummary: EXECUTE_TASK_LIST_CONTINUATION_SUMMARY,
      continuationResult: {
        success: true,
        message,
        ...(typeof extra?.status === "string" ? { status: extra.status } : {}),
        ...(typeof extra?.pending === "number" ? { pending: extra.pending } : {}),
      },
    },
  );

export const readTaskList = (filePath: string) => {
  const content = readFileSync(filePath, "utf-8");
  const parseResult = parseChecklist(content);
  const pendingTasks = parseResult.items.filter((item) => !item.completed);
  return { content, parseResult, pendingTasks };
};

export const validateTaskListFormat = (items: ReturnType<typeof parseChecklist>["items"]) => {
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

  return `taskList 格式错误：请确保每条任务使用 "Task <ID>:" 格式，并且 ID 唯一。\n${invalidItems.length > 0 ? `以下行缺少 Task ID：\n${invalidDetails}` : ""}${duplicateDetails}\n示例：- [ ] Task T1: 描述 [deps: Task init-repo]`;
};

export const getParentConversation = (taskId: string) => {
  const parentConv = conversationRepository.load(taskId);
  if (!parentConv) {
    throw new Error(`未找到父会话，任务ID：${taskId}`);
  }
  return parentConv;
};

export const collectCompletedTaskIds = (items: ReturnType<typeof parseChecklist>["items"]) => {
  const completedTaskIds = new Set<string>();
  for (const item of items) {
    if (!item.completed) continue;
    const id = getTaskId(item.description);
    if (id) completedTaskIds.add(id);
  }
  return completedTaskIds;
};

export const getTaskPriority = (executionType: TaskExecutionType) => {
  if (executionType === "failed") return 0;
  if (executionType === "running") return 1;
  return 2;
};

export const buildExecutionMessage = ({
  results,
  pendingTasks,
}: {
  results: TaskExecutionResult[];
  pendingTasks: ReturnType<typeof parseChecklist>["items"];
}) => {
  const hasIgnoredLegacyTools = results.some((r) => r.ignoredLegacyTools);
  const successCount = results.filter((r) => r.outcome === "success").length;
  const failedCount = results.filter((r) => r.outcome === "failed").length;
  const interruptedCount = results.filter((r) => r.outcome === "interrupted").length;
  const blockedCount = Math.max(
    0,
    pendingTasks.length - successCount - failedCount - interruptedCount,
  );

  let warningMessage = hasIgnoredLegacyTools
    ? "\nℹ️ 提示：部分任务条目仍带有旧版 `[tools: ...]` 配置，系统已忽略并改用统一子任务工具集。"
    : "";
  const shouldStopMessage = failedCount > 0 || interruptedCount > 0;

  if (failedCount > 0) {
    warningMessage += `\n⚠️ 警告：有 ${failedCount} 个任务执行失败，编排已停止；已保留为未完成，可修复后重新调用 taskList(action=execute) 重试。`;
  }

  if (interruptedCount > 0) {
    warningMessage += `\n⚠️ 提示：有 ${interruptedCount} 个任务被中断，编排已停止。`;
  }

  if (blockedCount > 0) {
    warningMessage += `\n⚠️ 警告：有 ${blockedCount} 个任务未被执行（可能依赖未满足、已中断或配置错误）。`;
  }

  return `${shouldStopMessage ? "⚠️ 自动执行已停止" : "✅ 自动执行完成"}（成功 ${successCount}/${pendingTasks.length}，失败 ${failedCount}，中断 ${interruptedCount}）${warningMessage}\n\n${results
    .map(
      (r, i) =>
        `任务 ${i + 1}: ${r.target}\n状态: ${
          r.outcome === "success" ? "成功" : r.outcome === "interrupted" ? "中断" : "失败"
        }\n结果: ${r.summary}${r.ignoredLegacyTools ? `\nℹ️ 已忽略旧版工具配置: ${r.ignoredLegacyTools.join(", ")}` : ""}`,
    )
    .join("\n\n")}`;
};

export const summarizeExecutionOutcomes = ({
  results,
  pendingTasks,
}: {
  results: TaskExecutionResult[];
  pendingTasks: ReturnType<typeof parseChecklist>["items"];
}) => {
  const successCount = results.filter((r) => r.outcome === "success").length;
  const failedCount = results.filter((r) => r.outcome === "failed").length;
  const interruptedCount = results.filter((r) => r.outcome === "interrupted").length;
  const blockedCount = Math.max(
    0,
    pendingTasks.length - successCount - failedCount - interruptedCount,
  );

  return { successCount, failedCount, interruptedCount, blockedCount };
};

const detectFinalDesignDraftModuleExecution = (taskListContent: string) => {
  if (!taskListContent.includes("最终设计稿模块实施")) {
    return null;
  }

  return { draftId: "" };
};

export const buildPostExecuteContinuationReason = ({
  taskListContent,
  results,
  pendingTasks,
}: {
  taskListContent: string;
  results: TaskExecutionResult[];
  pendingTasks: ReturnType<typeof parseChecklist>["items"];
}) => {
  const { failedCount, interruptedCount, blockedCount } = summarizeExecutionOutcomes({
    results,
    pendingTasks,
  });

  if (failedCount > 0 || interruptedCount > 0 || blockedCount > 0) {
    return "taskList(action=execute) 已执行完成，但仍有失败、中断或未执行任务。请基于最新执行结果继续处理，不要直接总结给用户。";
  }

  const finalDesignDraftContext = detectFinalDesignDraftModuleExecution(taskListContent);
  if (finalDesignDraftContext) {
    const draftIdHint = finalDesignDraftContext.draftId
      ? `draftId="${finalDesignDraftContext.draftId}"`
      : "对应的 draftId";
    return `taskList(action=execute) 已执行完成，且当前是最终设计稿模块实施任务。不要直接总结给用户；请立即调用 designDraft(action="generate")，参数使用 ${draftIdHint}，完成整页装配。整页装配完成后先调用 designDraft(action="read") 确认 final draft 已生成，再调用 designDraft(action="critique") 查看整页评审结果。`;
  }

  return "taskList(action=execute) 已执行完成。若全部完成请直接总结给用户。";
};

export const appendInternalExecutionSummary = (parentConv: ParentConversation, summary: string) => {
  parentConv.memory.addMessage({
    role: "user",
    content: `taskList 执行结果（内部上下文，请据此继续推进主任务）:\n\n${summary}`,
    type: "system",
    partial: false,
  });
};

export const getExecutionDocFilePath = (taskId: string) => getTaskListPath(taskId);
