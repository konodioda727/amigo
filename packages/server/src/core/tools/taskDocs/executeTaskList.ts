import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ToolInterface } from "@amigo-llm/types";
import { taskOrchestrator } from "@/core/conversation";
import { SubTaskManager } from "@/core/conversation/SubTaskManager";
import {
  parseChecklist,
  updateChecklistItemContent,
  updateProgressSection,
} from "@/core/templates/checklistParser";
import { logger } from "@/utils/logger";
import { createTool } from "../base";
import { getTaskDocsPath, parseToolsFromDescription } from "./utils";

/**
 * 执行任务列表工具
 * 用于根据 taskList.md 中的任务自动执行子任务
 * 支持中断恢复功能
 */
export const ExecuteTaskList = createTool({
  name: "executeTaskList",
  description: "根据当前任务的 taskList.md 自动调度子 Agent 执行任务。支持任务进度追踪和中断恢复。",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个任务执行工具，用于批量执行 taskList.md 中定义的任务。\n\n" +
    "**适用场景：**\n" +
    "1. **任务执行：** 在 taskList.md 创建并确认无误后，执行所有未完成的任务\n" +
    "2. **继续执行：** 如果之前任务部分失败或中断，可以再次调用继续执行剩余任务\n\n" +
    "**执行逻辑：**\n" +
    "- 读取 taskList.md 获取未完成任务\n" +
    "- 自动识别并优先处理 'In Progress' 状态的任务\n" +
    "- 将任务标记为 '(In Progress)' 并记录子任务 ID\n" +
    "- 并发调度子 Agent 执行任务（默认并发数: 2）\n" +
    "- 任务完成后移除 '(In Progress)' 标记并设为已完成\n" +
    "- 自动更新任务状态和进度统计\n" +
    "- 支持中断后继续执行",

  useExamples: [`<executeTaskList></executeTaskList>`],

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
        let currentContentForBatch = readFileSync(filePath, "utf-8");
        for (const taskItem of batch) {
          const { description, lineNumber } = taskItem;
          // 避免重复添加 (In Progress)
          if (!description.includes("(In Progress)")) {
            currentContentForBatch = updateChecklistItemContent(
              currentContentForBatch,
              lineNumber,
              `${description} (In Progress)`,
              false,
            );
          }
        }
        // 写入标记后的内容
        writeFileSync(filePath, currentContentForBatch, "utf-8");

        const batchResults = await Promise.all(
          batch.map(async (taskItem, batchIndex) => {
            const index = i + batchIndex;
            const { description } = taskItem;
            // 去除 (In Progress) 标记
            const cleanDescriptionForAgent = description.replace(/\(In Progress\)$/, "").trim();

            // 解析工具集
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

${forbiddenTools.length > 0 ? `\n⚠️ **警告：** 任务描述中请求了禁止的工具：${forbiddenTools.join(", ")}。子任务不允许再次分配任务。\n` : ""}
**设计参考：**
${designContent ? designContent : "无设计文档"}

**执行要求：**
1. 专注完成任务目标，不要偏离
2. 使用提供的工具完成任务
3. 完成后使用 completionResult 返回详细结果
4. 结果应包含实际内容，而不是描述
5. ⚠️ 你不能创建子任务或分配任务给其他代理`;

            // 使用 TaskOrchestrator 运行子任务，传递 taskDescription 用于状态管理
            let summary: string;

            try {
              const result = await taskOrchestrator.runSubTask({
                subPrompt: subAgentPrompt,
                parentId: taskId,
                target: cleanDescription,
                tools: availableTools,
                index,
                taskDescription: cleanDescriptionForAgent, // TaskOrchestrator 会自动管理状态
              });

              summary = result.result;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              summary = `任务执行失败: ${errorMsg}`;

              // 如果执行失败，标记任务失败
              const subTaskManager = new SubTaskManager(taskId as string);
              subTaskManager.markTaskFailed(cleanDescriptionForAgent, errorMsg);
            }

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
              summary,
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
        ? "\n⚠️ 警告：部分任务请求了不存在的工具，这些工具已被忽略。"
        : "";

      const executionMsg = `✅ 自动执行完成（${results.length}/${parseResult.total}）${warningMessage}\n\n${results
        .map(
          (r, i) =>
            `任务 ${i + 1}: ${r.target}\n结果: ${r.summary}${r.invalidTools ? `\n⚠️ 无效工具: ${r.invalidTools.join(", ")}` : ""}`,
        )
        .join("\n\n")}`;

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
