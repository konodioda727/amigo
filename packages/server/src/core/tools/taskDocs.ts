import type { Sandbox } from "@/core/sandbox";
import {
  parseChecklist,
  updateChecklistItemByDescription,
  updateProgressSection,
} from "@/core/templates/checklistParser";
import { logger } from "@/utils/logger";
import { createTool } from "./base";

/**
 * 将任务名称转换为 kebab-case 格式
 * @param name 原始任务名称
 * @returns kebab-case 格式的名称
 */
export function toKebabCase(name: string): string {
  return (
    name
      .trim()
      // 处理中文和其他非 ASCII 字符 - 保留它们
      .replace(/[\s_]+/g, "-") // 空格和下划线转为连字符
      .replace(/([a-z])([A-Z])/g, "$1-$2") // camelCase 转换
      .replace(/[^\p{L}\p{N}-]/gu, "") // 移除非字母、数字、连字符的字符（保留 Unicode 字母）
      .replace(/-+/g, "-") // 多个连字符合并
      .replace(/^-|-$/g, "") // 移除首尾连字符
      .toLowerCase()
  );
}

/**
 * 文档类型到文件名的映射
 */
const DOC_TYPE_TO_FILENAME: Record<string, string> = {
  requirements: "requirements.md",
  design: "design.md",
  taskList: "taskList.md",
};

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
  <taskName>用户登录功能</taskName>
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
  <taskName>数据导出功能</taskName>
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
      name: "taskName",
      optional: false,
      description: "任务名称，将自动转换为 kebab-case 格式作为文件夹名",
    },
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
    const { taskName, phase, content } = params;

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

    // 转换任务名称为 kebab-case
    const kebabTaskName = toKebabCase(taskName);
    if (!kebabTaskName) {
      const errorMsg = "任务名称转换后为空，请提供有效的任务名称";
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
    const docsPath = `docs/${kebabTaskName}`;
    const filePath = `${docsPath}/${fileName}`;

    try {
      // 获取沙箱实例
      const sandbox = (await context.getSandbox()) as Sandbox;
      if (!sandbox || !sandbox.isRunning()) {
        const errorMsg = "沙箱未运行，无法创建文档";
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            filePath: "",
            message: errorMsg,
          },
        };
      }

      // 创建目录
      await sandbox.runCommand(`mkdir -p ${docsPath}`);

      // 写入文件（使用 cat 和 heredoc 来处理多行内容）
      // 使用带引号的 heredoc 标记来避免 shell 变量展开
      const writeCmd = `cat > '${filePath}' << 'TASKDOC_EOF'
${content}
TASKDOC_EOF`;

      await sandbox.runCommand(writeCmd);

      // 验证文件是否创建成功
      const checkResult = await sandbox.runCommand(`test -f '${filePath}' && echo "exists"`);
      if (!checkResult?.includes("exists")) {
        throw new Error("文件创建验证失败");
      }

      const successMsg = `成功创建文档: ${filePath}`;
      logger.info(`[CreateTaskDocs] ${successMsg}`);

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
  <taskName>用户登录功能</taskName>
  <phase>requirements</phase>
</readTaskDocs>`,
    `<readTaskDocs>
  <taskName>数据导出功能</taskName>
  <phase>all</phase>
</readTaskDocs>`,
    `<readTaskDocs>
  <taskName>API重构</taskName>
  <phase>taskList</phase>
</readTaskDocs>`,
  ],

  params: [
    {
      name: "taskName",
      optional: false,
      description: "任务名称，将自动转换为 kebab-case 格式",
    },
    {
      name: "phase",
      optional: false,
      description: "要读取的文档类型：requirements、design、taskList，或 'all' 读取所有文档",
    },
  ],

  async invoke({ params, context }) {
    const { taskName, phase } = params;

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

    // 转换任务名称为 kebab-case
    const kebabTaskName = toKebabCase(taskName);
    if (!kebabTaskName) {
      const errorMsg = "任务名称转换后为空，请提供有效的任务名称";
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          documents: {},
          message: errorMsg,
        },
      };
    }

    const docsPath = `docs/${kebabTaskName}`;

    try {
      // 获取沙箱实例
      const sandbox = (await context.getSandbox()) as Sandbox;
      if (!sandbox || !sandbox.isRunning()) {
        const errorMsg = "沙箱未运行，无法读取文档";
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            documents: {},
            message: errorMsg,
          },
        };
      }

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
        const filePath = `${docsPath}/${fileName}`;

        try {
          // 检查文件是否存在
          const existsResult = await sandbox.runCommand(
            `test -f '${filePath}' && echo "exists" || echo "not_found"`,
          );

          if (existsResult?.includes("exists")) {
            // 读取文件内容
            const content = await sandbox.runCommand(`cat '${filePath}'`);
            if (content) {
              documents[docPhase as keyof typeof documents] = content.trim();
            }
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
        const notFoundMsg = `未找到任务 "${kebabTaskName}" 的任何文档`;
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
  <taskName>数据导出功能</taskName>
  <taskDescription>Task 1.1: 实现数据查询接口</taskDescription>
  <completed>true</completed>
</updateTaskList>`,
    `<updateTaskList>
  <taskName>用户登录功能</taskName>
  <taskDescription>实现密码加密存储</taskDescription>
  <completed>true</completed>
</updateTaskList>`,
    `<updateTaskList>
  <taskName>API重构</taskName>
  <taskDescription>Task 2.1: 重构认证模块</taskDescription>
  <completed>false</completed>
</updateTaskList>`,
  ],

  params: [
    {
      name: "taskName",
      optional: false,
      description: "任务名称，将自动转换为 kebab-case 格式",
    },
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
    const { taskName, taskDescription, completed } = params;

    // 解析 completed 参数
    const isCompleted = completed === "true" || completed === true;

    // 转换任务名称为 kebab-case
    const kebabTaskName = toKebabCase(taskName);
    if (!kebabTaskName) {
      const errorMsg = "任务名称转换后为空，请提供有效的任务名称";
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          message: errorMsg,
        },
      };
    }

    const filePath = `docs/${kebabTaskName}/taskList.md`;

    try {
      // 获取沙箱实例
      const sandbox = (await context.getSandbox()) as Sandbox;
      if (!sandbox || !sandbox.isRunning()) {
        const errorMsg = "沙箱未运行，无法更新任务列表";
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            message: errorMsg,
          },
        };
      }

      // 检查文件是否存在
      const existsResult = await sandbox.runCommand(
        `test -f '${filePath}' && echo "exists" || echo "not_found"`,
      );

      if (!existsResult?.includes("exists")) {
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
      const currentContent = await sandbox.runCommand(`cat '${filePath}'`);
      if (!currentContent) {
        const errorMsg = "无法读取任务列表文件内容";
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            message: errorMsg,
          },
        };
      }

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
      const writeCmd = `cat > '${filePath}' << 'TASKDOC_EOF'
${updatedContent}
TASKDOC_EOF`;

      await sandbox.runCommand(writeCmd);

      // 验证更新是否成功
      const verifyContent = await sandbox.runCommand(`cat '${filePath}'`);
      const verifyResult = parseChecklist(verifyContent || "");
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
  <taskName>数据导出功能</taskName>
</getTaskListProgress>`,
    `<getTaskListProgress>
  <taskName>用户登录功能</taskName>
</getTaskListProgress>`,
  ],

  params: [
    {
      name: "taskName",
      optional: false,
      description: "任务名称，将自动转换为 kebab-case 格式",
    },
  ],

  async invoke({ params, context }) {
    const { taskName } = params;

    // 转换任务名称为 kebab-case
    const kebabTaskName = toKebabCase(taskName);
    if (!kebabTaskName) {
      const errorMsg = "任务名称转换后为空，请提供有效的任务名称";
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          message: errorMsg,
        },
      };
    }

    const filePath = `docs/${kebabTaskName}/taskList.md`;

    try {
      // 获取沙箱实例
      const sandbox = (await context.getSandbox()) as Sandbox;
      if (!sandbox || !sandbox.isRunning()) {
        const errorMsg = "沙箱未运行，无法获取任务进度";
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            message: errorMsg,
          },
        };
      }

      // 检查文件是否存在
      const existsResult = await sandbox.runCommand(
        `test -f '${filePath}' && echo "exists" || echo "not_found"`,
      );

      if (!existsResult?.includes("exists")) {
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
      const content = await sandbox.runCommand(`cat '${filePath}'`);
      if (!content) {
        const errorMsg = "无法读取任务列表文件内容";
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            message: errorMsg,
          },
        };
      }

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
