import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ToolInterface } from "@amigo-llm/types";
import {
  parseChecklist,
  updateChecklistItemByDescription,
  updateChecklistItemContent,
  updateProgressSection,
} from "@/core/templates/checklistParser";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";
import { taskOrchestrator } from "../conversation";
import { createTool } from "./base";

/**
 * 文档类型到文件名的映射
 */
const DOC_TYPE_TO_FILENAME: Record<string, string> = {
  requirements: "requirements.md",
  design: "design.md",
  taskList: "taskList.md",
};

/**
 * 从任务描述中解析工具集
 * 格式: "Task 1.1: 任务描述 [tools: tool1, tool2]"
 */
function parseToolsFromDescription(description: string): {
  cleanDescription: string;
  tools: string[];
} {
  const toolsMatch = description.match(/\[tools:\s*([^\]]+)\]/);
  if (!toolsMatch || !toolsMatch[1]) {
    return { cleanDescription: description.trim(), tools: [] };
  }

  const toolsStr = toolsMatch[1];
  const tools = toolsStr
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const cleanDescription = description.replace(/\[tools:[^\]]+\]/, "").trim();

  return { cleanDescription, tools };
}

/**
 * 获取 taskDocs 存储路径
 */
function getTaskDocsPath(taskId: string): string {
  const storagePath = getGlobalState("globalStoragePath") || process.cwd();
  return path.join(storagePath, taskId, "taskDocs");
}

/**
 * 确保目录存在
 */
function ensureDirectoryExists(directory: string): void {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

/**
 * 创建任务文档工具
 * 用于在沙箱的 docs 目录中创建和管理任务文档
 */
export const CreateTaskDocs = createTool({
  name: "createTaskDocs",
  description: "在沙箱的 docs 目录中创建任务文档。用于结构化工作流中记录需求、设计和任务列表。",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个文档管理工具，用于在结构化工作流中创建和存储任务相关文档。\n\n" +
    "**适用场景：**\n" +
    "1. **需求分析阶段：** 创建 requirements.md 记录用户需求分析结果\n" +
    "2. **设计阶段：** 创建 design.md 记录信息收集和设计方案\n" +
    "3. **任务拆分阶段：** 创建 taskList.md 记录细化的执行步骤\n\n" +
    "**文档存储位置：**\n" +
    "所有文档存储在 `docs/{task-name}/` 目录下，task-name 会自动转换为 kebab-case 格式。\n\n" +
    "**注意事项：**\n" +
    "- 任务名称会自动转换为 kebab-case 格式\n" +
    "- 如果文档已存在，将被覆盖\n" +
    "- 文档使用 UTF-8 编码",

  useExamples: [
    `<createTaskDocs>
  <phase>requirements</phase>
  <content># Task: 用户登录功能

## Background
用户需要一个安全的登录系统

## Objectives
- 实现用户名密码登录
- 支持记住登录状态

## Constraints
- 密码需要加密存储
- 登录失败需要限制尝试次数

## Success Criteria
- [ ] 用户可以成功登录
- [ ] 密码错误时显示友好提示
  </content>
</createTaskDocs>`,
    `<createTaskDocs>
  <phase>taskList</phase>
  <content># Task List: 数据导出功能

## Tasks

### Phase 1: 基础实现
- [ ] Task 1.1: 实现数据查询接口
- [ ] Task 1.2: 实现 CSV 格式导出

### Phase 2: 优化
- [ ] Task 2.1: 添加进度显示
- [ ] Task 2.2: 支持大文件分片导出

## Progress
- Total: 4 tasks
- Completed: 0 tasks
- Remaining: 4 tasks
  </content>
</createTaskDocs>`,
  ],

  params: [
    {
      name: "phase",
      optional: false,
      description: "文档类型：requirements（需求文档）、design（设计文档）、taskList（任务列表）",
    },
    {
      name: "content",
      optional: false,
      description: "文档内容，使用 Markdown 格式",
    },
  ],

  async invoke({ params, context }) {
    const { phase, content } = params;
    const { taskId } = context;

    if (!taskId) {
      const errorMsg = "taskId 不能为空";
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          filePath: "",
          message: errorMsg,
        },
      };
    }

    // 验证 phase 参数
    if (!["requirements", "design", "taskList"].includes(phase)) {
      const errorMsg = `无效的文档类型: ${phase}。支持的类型：requirements、design、taskList`;
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          filePath: "",
          message: errorMsg,
        },
      };
    }

    // 构建文件路径
    const fileName = DOC_TYPE_TO_FILENAME[phase];
    if (!fileName) {
      const errorMsg = `无法获取文档文件名: ${phase}`;
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          filePath: "",
          message: errorMsg,
        },
      };
    }
    const taskDocsPath = getTaskDocsPath(taskId as string);
    const filePath = path.join(taskDocsPath, fileName);

    try {
      // 确保目录存在
      ensureDirectoryExists(taskDocsPath);

      // 写入文件
      writeFileSync(filePath, content, "utf-8");

      const successMsg = `成功创建文档: ${filePath}`;
      logger.info(`[CreateTaskDocs] ${successMsg}`);

      // 文档创建后，系统会暂停等待用户确认
      // 用户确认后，可以使用 executeTaskList 工具执行任务
      return {
        message: successMsg,
        toolResult: {
          success: true,
          filePath,
          message: successMsg,
        },
      };
    } catch (error) {
      const errorMsg = `创建文档失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[CreateTaskDocs] ${errorMsg}`);

      return {
        message: errorMsg,
        toolResult: {
          success: false,
          filePath,
          message: errorMsg,
        },
      };
    }
  },
});

/**
 * 读取任务文档工具
 * 用于从沙箱的 docs 目录中读取任务文档
 */
export const ReadTaskDocs = createTool({
  name: "readTaskDocs",
  description: "从沙箱的 docs 目录中读取任务文档。用于恢复工作流状态或查看已有文档内容。",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个文档读取工具，用于获取已创建的任务文档内容。\n\n" +
    "**适用场景：**\n" +
    "1. **恢复工作流：** 读取已有文档以恢复中断的工作流程\n" +
    "2. **阶段转换：** 在进入新阶段前读取前置文档\n" +
    "3. **执行阶段：** 读取 taskList.md 获取待执行的任务\n" +
    "4. **验证阶段：** 读取需求文档验证任务完成情况\n\n" +
    "**读取选项：**\n" +
    "- 指定 phase 读取单个文档\n" +
    "- 使用 phase='all' 读取所有文档\n\n" +
    "**注意事项：**\n" +
    "- 任务名称会自动转换为 kebab-case 格式\n" +
    "- 如果文档不存在，对应字段返回空",

  useExamples: [
    `<readTaskDocs>
  <phase>requirements</phase>
</readTaskDocs>`,
    `<readTaskDocs>
  <phase>all</phase>
</readTaskDocs>`,
    `<readTaskDocs>
  <phase>taskList</phase>
</readTaskDocs>`,
  ],

  params: [
    {
      name: "phase",
      optional: false,
      description: "要读取的文档类型：requirements、design、taskList，或 'all' 读取所有文档",
    },
  ],

  async invoke({ params, context }) {
    const { phase } = params;
    const { taskId } = context;

    if (!taskId) {
      const errorMsg = "taskId 不能为空";
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          documents: {},
          message: errorMsg,
        },
      };
    }

    // 验证 phase 参数
    const validPhases = ["requirements", "design", "taskList", "all"];
    if (!validPhases.includes(phase)) {
      const errorMsg = `无效的文档类型: ${phase}。支持的类型：requirements、design、taskList、all`;
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          documents: {},
          message: errorMsg,
        },
      };
    }

    const taskDocsPath = getTaskDocsPath(taskId as string);

    try {
      const documents: {
        requirements?: string;
        design?: string;
        taskList?: string;
      } = {};

      // 确定要读取的文档类型
      const phasesToRead = phase === "all" ? ["requirements", "design", "taskList"] : [phase];

      // 读取文档
      for (const docPhase of phasesToRead) {
        const fileName = DOC_TYPE_TO_FILENAME[docPhase];
        if (!fileName) {
          logger.warn(`[ReadTaskDocs] 无法获取文档文件名: ${docPhase}`);
          continue;
        }
        const filePath = path.join(taskDocsPath, fileName);

        try {
          if (existsSync(filePath)) {
            const content = readFileSync(filePath, "utf-8");
            documents[docPhase as keyof typeof documents] = content.trim();
          }
        } catch (readError) {
          logger.warn(
            `[ReadTaskDocs] 读取 ${filePath} 失败: ${readError instanceof Error ? readError.message : String(readError)}`,
          );
        }
      }

      // 检查是否读取到任何文档
      const foundDocs = Object.keys(documents).filter(
        (key) => documents[key as keyof typeof documents],
      );

      if (foundDocs.length === 0) {
        const notFoundMsg = "未找到任何文档";
        logger.info(`[ReadTaskDocs] ${notFoundMsg}`);
        return {
          message: notFoundMsg,
          toolResult: {
            success: false,
            documents: {},
            message: notFoundMsg,
          },
        };
      }

      const successMsg = `成功读取 ${foundDocs.length} 个文档: ${foundDocs.join(", ")}`;
      logger.info(`[ReadTaskDocs] ${successMsg}`);

      return {
        message: successMsg,
        toolResult: {
          success: true,
          documents,
          message: successMsg,
        },
      };
    } catch (error) {
      const errorMsg = `读取文档失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[ReadTaskDocs] ${errorMsg}`);

      return {
        message: errorMsg,
        toolResult: {
          success: false,
          documents: {},
          message: errorMsg,
        },
      };
    }
  },
});

/**
 * 更新任务列表工具
 * 用于更新 taskList.md 中的任务状态和进度统计
 */
export const UpdateTaskList = createTool({
  name: "updateTaskList",
  description: "更新 taskList.md 中的任务状态。用于在执行阶段标记任务为完成，并自动更新进度统计。",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个任务状态更新工具，用于在执行阶段追踪任务完成情况。\n\n" +
    "**适用场景：**\n" +
    "1. **任务完成：** 当子 Agent 完成任务后，标记对应任务为已完成\n" +
    "2. **任务回退：** 如果任务验证失败，可以将任务标记回未完成状态\n" +
    "3. **进度追踪：** 自动更新文档中的进度统计部分\n\n" +
    "**更新方式：**\n" +
    "- 通过任务描述精确匹配要更新的任务\n" +
    "- 将 `- [ ]` 更新为 `- [x]` 或反之\n" +
    "- 自动更新 Progress 部分的统计数据\n\n" +
    "**注意事项：**\n" +
    "- 任务描述必须精确匹配（不含 checkbox 部分）\n" +
    "- 如果找不到匹配的任务，将返回错误\n" +
    "- 更新后会自动同步进度统计",

  useExamples: [
    `<updateTaskList>
  <taskDescription>Task 1.1: 实现数据查询接口</taskDescription>
  <completed>true</completed>
</updateTaskList>`,
    `<updateTaskList>
  <taskDescription>实现密码加密存储</taskDescription>
  <completed>true</completed>
</updateTaskList>`,
    `<updateTaskList>
  <taskDescription>Task 2.1: 重构认证模块</taskDescription>
  <completed>false</completed>
</updateTaskList>`,
  ],

  params: [
    {
      name: "taskDescription",
      optional: false,
      description: "要更新的任务描述，必须精确匹配 taskList.md 中的任务描述（不含 checkbox 部分）",
    },
    {
      name: "completed",
      optional: false,
      description: "任务是否完成：true 表示完成（标记为 [x]），false 表示未完成（标记为 [ ]）",
    },
  ],

  async invoke({ params, context }) {
    const { taskDescription, completed } = params;
    const { taskId } = context;

    if (!taskId) {
      const errorMsg = "taskId 不能为空";
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          message: errorMsg,
        },
      };
    }

    // 解析 completed 参数
    const isCompleted = completed === "true" || completed === true;

    const taskDocsPath = getTaskDocsPath(taskId as string);
    const filePath = path.join(taskDocsPath, "taskList.md");

    try {
      // 检查文件是否存在
      if (!existsSync(filePath)) {
        const errorMsg = `任务列表文件不存在: ${filePath}`;
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            message: errorMsg,
          },
        };
      }

      // 读取当前文件内容
      const currentContent = readFileSync(filePath, "utf-8");

      // 解析当前任务列表，检查任务是否存在
      const parseResult = parseChecklist(currentContent);
      const targetTask = parseResult.items.find((item) => item.description === taskDescription);

      if (!targetTask) {
        const errorMsg = `未找到匹配的任务: "${taskDescription}"`;
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            message: errorMsg,
            availableTasks: parseResult.items.map((item) => item.description),
          },
        };
      }

      // 检查任务状态是否需要更新
      if (targetTask.completed === isCompleted) {
        const statusText = isCompleted ? "已完成" : "未完成";
        const noChangeMsg = `任务 "${taskDescription}" 已经是${statusText}状态，无需更新`;
        return {
          message: noChangeMsg,
          toolResult: {
            success: true,
            message: noChangeMsg,
            progress: {
              total: parseResult.total,
              completed: parseResult.completed,
              remaining: parseResult.remaining,
              percentage: parseResult.percentage,
            },
          },
        };
      }

      // 更新任务状态
      let updatedContent = updateChecklistItemByDescription(
        currentContent,
        taskDescription,
        isCompleted,
      );

      // 更新进度统计
      updatedContent = updateProgressSection(updatedContent);

      // 写回文件
      writeFileSync(filePath, updatedContent, "utf-8");

      // 验证更新是否成功
      const verifyContent = readFileSync(filePath, "utf-8");
      const verifyResult = parseChecklist(verifyContent);
      const verifyTask = verifyResult.items.find((item) => item.description === taskDescription);

      if (!verifyTask || verifyTask.completed !== isCompleted) {
        throw new Error("任务状态更新验证失败");
      }

      const statusText = isCompleted ? "已完成" : "未完成";
      const successMsg = `成功将任务 "${taskDescription}" 标记为${statusText}`;
      logger.info(`[UpdateTaskList] ${successMsg}`);

      return {
        message: successMsg,
        toolResult: {
          success: true,
          message: successMsg,
          progress: {
            total: verifyResult.total,
            completed: verifyResult.completed,
            remaining: verifyResult.remaining,
            percentage: verifyResult.percentage,
          },
        },
      };
    } catch (error) {
      const errorMsg = `更新任务列表失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[UpdateTaskList] ${errorMsg}`);

      return {
        message: errorMsg,
        toolResult: {
          success: false,
          message: errorMsg,
        },
      };
    }
  },
});

/**
 * 获取任务列表进度工具
 * 用于获取 taskList.md 的当前进度统计
 */
export const GetTaskListProgress = createTool({
  name: "getTaskListProgress",
  description: "获取 taskList.md 的当前进度统计。用于快速了解任务完成情况。",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个进度查询工具，用于获取任务列表的完成情况统计。\n\n" +
    "**适用场景：**\n" +
    "1. **进度检查：** 在执行阶段查看当前完成进度\n" +
    "2. **完成判断：** 判断是否所有任务都已完成\n" +
    "3. **状态报告：** 向用户报告当前工作进度\n\n" +
    "**返回信息：**\n" +
    "- 总任务数\n" +
    "- 已完成任务数\n" +
    "- 剩余任务数\n" +
    "- 完成百分比\n" +
    "- 待完成任务列表",

  useExamples: [
    `<getTaskListProgress>
</getTaskListProgress>`,
  ],

  params: [],

  async invoke({ context }) {
    const { taskId } = context;

    if (!taskId) {
      const errorMsg = "taskId 不能为空";
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          message: errorMsg,
        },
      };
    }

    const taskDocsPath = getTaskDocsPath(taskId as string);
    const filePath = path.join(taskDocsPath, "taskList.md");

    try {
      // 检查文件是否存在
      if (!existsSync(filePath)) {
        const errorMsg = `任务列表文件不存在: ${filePath}`;
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            message: errorMsg,
          },
        };
      }

      // 读取文件内容
      const content = readFileSync(filePath, "utf-8");

      // 解析任务列表
      const parseResult = parseChecklist(content);
      const pendingTasks = parseResult.items
        .filter((item) => !item.completed)
        .map((item) => item.description);
      const completedTasks = parseResult.items
        .filter((item) => item.completed)
        .map((item) => item.description);

      const isAllDone = parseResult.total > 0 && parseResult.remaining === 0;
      const statusText = isAllDone
        ? "所有任务已完成！"
        : `还有 ${parseResult.remaining} 个任务待完成`;

      const successMsg = `任务进度: ${parseResult.completed}/${parseResult.total} (${parseResult.percentage}%) - ${statusText}`;
      logger.info(`[GetTaskListProgress] ${successMsg}`);

      return {
        message: successMsg,
        toolResult: {
          success: true,
          message: successMsg,
          progress: {
            total: parseResult.total,
            completed: parseResult.completed,
            remaining: parseResult.remaining,
            percentage: parseResult.percentage,
          },
          isAllCompleted: isAllDone,
          pendingTasks,
          completedTasks,
        },
      };
    } catch (error) {
      const errorMsg = `获取任务进度失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[GetTaskListProgress] ${errorMsg}`);

      return {
        message: errorMsg,
        toolResult: {
          success: false,
          message: errorMsg,
        },
      };
    }
  },
});

/**
 * 执行任务列表工具
 * 用于根据 taskList.md 中的任务自动执行子任务
 */
export const ExecuteTaskList = createTool({
  name: "executeTaskList",
  description:
    "根据 taskList.md 中的任务描述，自动调度子 Agent 执行任务。用于在用户确认任务列表后批量执行任务。支持任务进度追踪和断点续传。",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个任务执行工具，用于批量执行 taskList.md 中定义的任务。\n\n" +
    "**适用场景：**\n" +
    "1. **任务执行：** 在 taskList.md 创建并确认无误后，执行所有未完成的任务\n" +
    "2. **继续执行：** 如果之前任务部分失败或中断，可以再次调用继续执行剩余任务（包括正在进行中的任务）\n\n" +
    "**执行逻辑：**\n" +
    "- 读取 taskList.md 获取未完成任务\n" +
    "- 自动识别并优先处理 'In Progress' 状态的任务\n" +
    "- 将任务标记为 '(In Progress)' 并写入文件\n" +
    "- 并发调度子 Agent 执行任务（默认并发数: 2）\n" +
    "- 任务完成后移除 '(In Progress)' 标记并设为已完成\n" +
    "- 自动更新任务状态和进度统计\n\n" +
    "**注意事项：**\n" +
    "- 任务名称会自动转换为 kebab-case 格式\n" +
    "- 子 Agent 无法使用任务分配相关工具",

  useExamples: [
    `<executeTaskList>
</executeTaskList>`,
  ],

  params: [],

  async invoke({ context }) {
    const { taskId, getToolByName } = context;

    if (!taskId) {
      const errorMsg = "taskId 不能为空";
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          message: errorMsg,
        },
      };
    }

    const taskDocsPath = getTaskDocsPath(taskId as string);
    const filePath = path.join(taskDocsPath, "taskList.md");

    try {
      if (!existsSync(filePath)) {
        const errorMsg = `任务列表文件不存在: ${filePath}`;
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            message: errorMsg,
          },
        };
      }

      // 读取文件内容
      const content = readFileSync(filePath, "utf-8");

      // 解析任务列表
      const parseResult = parseChecklist(content);
      // 过滤未完成的任务
      const pendingTasks = parseResult.items.filter((item) => !item.completed);

      if (pendingTasks.length === 0) {
        const msg = "taskList 中没有待执行任务";
        logger.info(`[ExecuteTaskList] ${msg}`);
        return {
          message: msg,
          toolResult: {
            success: true,
            message: msg,
            executed: false,
          },
        };
      }

      logger.info(`[ExecuteTaskList] 找到 ${pendingTasks.length} 个待执行任务，开始自动执行`);

      // 读取 design.md（可选，用于生成 subAgentPrompt）
      let designContent = "";
      const designPath = path.join(taskDocsPath, "design.md");
      if (existsSync(designPath)) {
        designContent = readFileSync(designPath, "utf-8");
      }

      // 执行任务
      const CONCURRENCY_LIMIT = 2;
      const results = [];

      for (let i = 0; i < pendingTasks.length; i += CONCURRENCY_LIMIT) {
        const batch = pendingTasks.slice(i, i + CONCURRENCY_LIMIT);

        // 1. 批量标记任务为进行中 (In Progress)
        const currentContentForBatch = readFileSync(filePath, "utf-8");
        let updatedContent = currentContentForBatch;
        for (const taskItem of batch) {
          const { description, lineNumber } = taskItem;
          // 避免重复添加 (In Progress)
          if (!description.includes("(In Progress)")) {
            updatedContent = updateChecklistItemContent(
              updatedContent,
              lineNumber, // 使用行号更准确，避免描述重复
              `${description} (In Progress)`,
              false,
            );
          }
        }
        // 写入标记后的内容
        writeFileSync(filePath, updatedContent, "utf-8");

        const batchResults = await Promise.all(
          batch.map(async (taskItem, batchIndex) => {
            const index = i + batchIndex;
            const { description } = taskItem;
            // 如果原本已经包含 (In Progress)，则使用它作为目标描述
            // 但为了传给 subAgent，我们需要去除标记
            const cleanDescriptionForAgent = description.replace(/\\(In Progress\\)$/, "").trim();

            // 解析工具集 (使用去除标记后的描述)
            const { cleanDescription, tools: requestedTools } =
              parseToolsFromDescription(cleanDescriptionForAgent);

            // 定义子任务不允许使用的工具（任务分配相关）
            const FORBIDDEN_SUB_TASK_TOOLS = [
              "createTaskDocs",
              "readTaskDocs",
              "updateTaskList",
              "getTaskListProgress",
              "executeTaskList",
            ];

            // 验证工具
            // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
            const availableTools: ToolInterface<any>[] = [];
            const invalidTools: string[] = [];
            const forbiddenTools: string[] = [];

            for (const toolName of requestedTools) {
              if (FORBIDDEN_SUB_TASK_TOOLS.includes(toolName)) {
                forbiddenTools.push(toolName);
                logger.warn(
                  `[ExecuteTaskList] 子任务 "${cleanDescription}" 请求了禁止使用的工具: ${toolName}`,
                );
                continue;
              }

              // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
              const tool = getToolByName(toolName) as ToolInterface<any> | undefined;
              if (tool) {
                availableTools.push(tool);
              } else {
                invalidTools.push(toolName);
              }
            }

            if (invalidTools.length > 0) {
              logger.warn(
                `[ExecuteTaskList] 任务 "${cleanDescription}" 请求了不存在的工具: ${invalidTools.join(", ")}`,
              );
            }

            // 生成 subAgentPrompt
            const subAgentPrompt = `你是一个专业的任务执行代理。

**任务目标：** ${cleanDescription}

**可用工具：** ${availableTools.length > 0 ? availableTools.map((t) => t.name).join(", ") : "基础工具（不包括任务分配工具）"}

${forbiddenTools.length > 0 ? `\\n⚠️ **警告：** 任务描述中请求了禁止的工具：${forbiddenTools.join(", ")}。子任务不允许再次分配任务。\\n` : ""}
**设计参考：**
${designContent ? designContent : "无设计文档"}

**执行要求：**
1. 专注完成任务目标，不要偏离
2. 使用提供的工具完成任务
3. 完成后使用 completionResult 返回详细结果
4. 结果应包含实际内容，而不是描述
5. ⚠️ 你不能创建子任务或分配任务给其他代理`;

            // 使用 TaskOrchestrator 运行子任务
            const summary = await taskOrchestrator.runSubTask({
              subPrompt: subAgentPrompt,
              parentId: taskId,
              target: cleanDescription,
              tools: availableTools,
              index,
            });

            // 任务完成，更新文件
            try {
              const currentContent = readFileSync(filePath, "utf-8");
              const updated = updateChecklistItemContent(
                currentContent,
                taskItem.lineNumber,
                cleanDescriptionForAgent,
                true,
              ); // 移除 In Progress, 设为 true
              const final = updateProgressSection(updated);
              writeFileSync(filePath, final, "utf-8");
            } catch (updateError) {
              logger.error(`[ExecuteTaskList] 更新任务状态失败: ${updateError}`);
            }

            return {
              target: cleanDescription,
              summary: summary.result, // Extract the result string from the summary object
              requestedTools: requestedTools.length,
              availableTools: availableTools.length,
              invalidTools: invalidTools.length > 0 ? invalidTools : undefined,
            };
          }),
        );

        results.push(...batchResults);
      }

      const hasInvalidTools = results.some((r) => r.invalidTools);
      const warningMessage = hasInvalidTools
        ? "\\n⚠️ 警告：部分任务请求了不存在的工具，这些工具已被忽略。"
        : "";

      const executionMsg = `✅ 自动执行完成（${results.length}/${parseResult.total}）${warningMessage}\\n\\n${results
        .map(
          (r, i) =>
            `任务 ${i + 1}: ${r.target}\\n结果: ${r.summary}${r.invalidTools ? `\\n⚠️ 无效工具: ${r.invalidTools.join(", ")}` : ""}`,
        )
        .join("\\n\\n")}`;

      logger.info(`[ExecuteTaskList] ${executionMsg}`);

      return {
        message: executionMsg,
        toolResult: {
          success: true,
          message: executionMsg,
          executionResults: results,
        },
      };
    } catch (error) {
      const errorMsg = `执行任务列表失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[ExecuteTaskList] ${errorMsg}`);

      return {
        message: errorMsg,
        toolResult: {
          success: false,
          message: errorMsg,
        },
      };
    }
  },
});
