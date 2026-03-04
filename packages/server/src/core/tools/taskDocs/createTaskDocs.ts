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
    "仅在 Structured Spec 流程下创建 requirements/design/taskList 时使用。简单任务或闲聊不要调用。",

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
