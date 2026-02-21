import { writeFileSync } from "node:fs";
import path from "node:path";
import { logger } from "@/utils/logger";
import { createTool } from "../base";
import { DOC_TYPE_TO_FILENAME, ensureDirectoryExists, getTaskDocsPath } from "./utils";

/**
 * 创建任务文档工具
 * 用于创建当前任务的三个阶段文档：requirements.md, design.md, taskList.md
 */
export const CreateTaskDocs = createTool({
  name: "createTaskDocs",
  description: "创建当前任务的阶段文档（requirements/design/taskList）。每个任务只有三个固定文档。",
  whenToUse:
    "**工具性质：**\n" +
    "文档管理工具，用于 'Structured Spec Mode' 工作流。\n\n" +
    "**适用场景：**\n" +
    "仅在处理复杂项目或严肃任务时使用。简单任务或闲聊请勿使用此工具。\n" +
    "1. **requirements:** 记录需求\n" +
    "2. **design:** 记录设计\n" +
    "3. **taskList:** 记录执行步骤\n",

  useExamples: [
    `<createTaskDocs>
  <phase>requirements</phase>
  <content># Requirements

## Background
用户需要一个安全的登录系统

## Objectives
- 实现用户名密码登录
- 支持记住登录状态
  </content>
</createTaskDocs>`,
    `<createTaskDocs>
  <phase>taskList</phase>
  <content># Task List

## Tasks

### Phase 1: 基础实现
- [ ] Task 1.1: 实现数据查询接口 [tools: readFile, editFile]
- [ ] Task 1.2: 实现 CSV 格式导出 [tools: editFile]

## Progress
- Total: 2 tasks
- Completed: 0 tasks
- Remaining: 2 tasks
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

      const successMsg = `成功创建文档: ${fileName}`;
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
