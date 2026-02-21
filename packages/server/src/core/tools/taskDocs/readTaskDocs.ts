import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { logger } from "@/utils/logger";
import { createTool } from "../base";
import { DOC_TYPE_TO_FILENAME, getTaskDocsPath } from "./utils";

/**
 * 读取任务文档工具
 * 用于读取当前任务的文档
 */
export const ReadTaskDocs = createTool({
  name: "readTaskDocs",
  description: "读取当前任务的文档（requirements/design/taskList）。每个任务只有三个固定文档。",
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
    "- 使用 phase='all' 读取所有文档",

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
