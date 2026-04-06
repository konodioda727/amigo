import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { logger } from "@/utils/logger";
import { createTool } from "../base";
import { createToolResult } from "../result";
import { addLineNumbers, DOC_TYPE_TO_FILENAME, getTaskDocsPath } from "./utils";

const PHASE_LABELS: Record<string, string> = {
  requirements: "requirements.md",
  design: "design.md",
  taskList: "taskList.md",
};

const buildReadTaskDocsContinuationSummary = (docKeys: string[]): string => {
  const labels = docKeys
    .map((key) => PHASE_LABELS[key] || key)
    .map((value) => value.trim())
    .filter(Boolean);
  if (labels.length === 0) {
    return "【已阅读任务文档】";
  }
  return `【已阅读 ${labels.join(", ")}】`;
};

/**
 * 读取任务文档工具
 * 用于读取当前任务的文档
 */
export const ReadTaskDocs = createTool({
  name: "readTaskDocs",
  description: "读取当前任务的文档（requirements/design/taskList）。每个任务只有三个固定文档。",
  whenToUse: "需要读取 requirements/design/taskList 以恢复上下文、进入下一阶段或执行任务时使用。",

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
      return createToolResult(
        {
          success: false,
          documents: {},
          message: errorMsg,
        },
        {
          transportMessage: errorMsg,
        },
      );
    }

    // 验证 phase 参数
    const validPhases = ["requirements", "design", "taskList", "all"];
    if (!validPhases.includes(phase)) {
      const errorMsg = `无效的文档类型: ${phase}。支持的类型：requirements、design、taskList、all`;
      return createToolResult(
        {
          success: false,
          documents: {},
          message: errorMsg,
        },
        {
          transportMessage: errorMsg,
        },
      );
    }

    const taskDocsPath = getTaskDocsPath(taskId as string);

    try {
      const documents: {
        requirements?: {
          content: string;
          numberedContent: string;
          totalLines: number;
          startLine: number;
          endLine: number;
        };
        design?: {
          content: string;
          numberedContent: string;
          totalLines: number;
          startLine: number;
          endLine: number;
        };
        taskList?: {
          content: string;
          numberedContent: string;
          totalLines: number;
          startLine: number;
          endLine: number;
        };
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
            const content = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").trim();
            const totalLines = content ? content.split("\n").length : 0;
            documents[docPhase as keyof typeof documents] = {
              content,
              numberedContent: content ? addLineNumbers(content, 1) : "",
              totalLines,
              startLine: 1,
              endLine: totalLines,
            };
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
        return createToolResult(
          {
            success: false,
            documents: {},
            message: notFoundMsg,
          },
          {
            transportMessage: notFoundMsg,
          },
        );
      }

      const successMsg = `成功读取 ${foundDocs.length} 个文档: ${foundDocs.join(", ")}`;
      logger.info(`[ReadTaskDocs] ${successMsg}`);

      return createToolResult(
        {
          success: true,
          documents,
          message: successMsg,
        },
        {
          transportMessage: successMsg,
          continuationSummary: buildReadTaskDocsContinuationSummary(foundDocs),
        },
      );
    } catch (error) {
      const errorMsg = `读取文档失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[ReadTaskDocs] ${errorMsg}`);

      return createToolResult(
        {
          success: false,
          documents: {},
          message: errorMsg,
        },
        {
          transportMessage: errorMsg,
        },
      );
    }
  },
});
