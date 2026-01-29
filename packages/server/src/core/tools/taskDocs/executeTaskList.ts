import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ToolInterface } from "@amigo-llm/types";
import pWaitFor from "p-wait-for";
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
    "- 使用拓扑排序确保任务按依赖顺序执行（先执行入度为 0 的任务）\n" +
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
      const results: any[] = [];
      const completedTaskIds = new Set<string>();
      const runningTaskIds = new Set<string>();

      // 获取父会话
      const parentConv = conversationRepository.load(taskId as string);
      if (!parentConv) {
        throw new Error(`未找到父会话，任务ID：${taskId}`);
      }

      // 初始化已完成的任务 ID
      for (const item of parseResult.items) {
        if (item.completed) {
          const id = getTaskId(item.description);
          if (id) completedTaskIds.add(id);
        }
      }

      // 获取所有任务项（包括已完成的），用于依赖查找
      // 使用拓扑排序确保任务按依赖顺序执行
      const allTasks = sortTasksTopologically(parseResult.items);

      // --- 恢复逻辑 ---
      const subTasks = parentConv.memory.subTasks;
      const inProgressTasksFromStatus = Object.entries(subTasks)
        .filter(([_, status]) => status.status === "running" && status.subTaskId)
        .map(([description, status]) => ({
          description,
          subTaskId: status.subTaskId as string,
        }));

      for (const { description: taskDesc, subTaskId } of inProgressTasksFromStatus) {
        // 在 checklist 中查找对应项（匹配描述开头，因为可能带有 (In Progress) 标记）
        const taskItem = allTasks.find(
          (item) => item.description.startsWith(taskDesc) && !item.completed,
        );
        if (!taskItem) continue;

        const id = getTaskId(taskItem.description);
        if (!id) continue;

        // 尝试加载会话
        const subConversation = conversationRepository.load(subTaskId);
        if (subConversation && subConversation.status !== "completed") {
          logger.info(
            `[ExecuteTaskList] 发现中断的任务: ${taskDesc} (${subTaskId}), 正在恢复监控...`,
          );
          runningTaskIds.add(id);

          const { description, lineNumber } = taskItem;
          const cleanDescriptionForAgent = description.replace(/\(In Progress\)$/, "").trim();

          // 异步监控恢复的任务
          (async () => {
            let summary: string;
            try {
              // 获取执行器并确保在运行
              const executor = taskOrchestrator.getExecutor(subTaskId);
              if (["idle", "aborted"].includes(subConversation.status)) {
                // 如果是空闲或被中断，尝试重新触发
                executor.execute(subConversation);
              }

              // 等待完成
              await pWaitFor(() => subConversation.status === "completed", {
                timeout: 30 * 60 * 1000,
              });

              // 获取结果
              const messages = subConversation.memory.messages;
              const lastMessage = messages[messages.length - 1];
              summary = lastMessage?.content || "任务已恢复并完成";
              parentConv.updateSubTaskStatus(cleanDescriptionForAgent, {
                status: "completed",
                completedAt: new Date().toISOString(),
              });
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              summary = `恢复的任务执行失败: ${errorMsg}`;
              parentConv.updateSubTaskStatus(cleanDescriptionForAgent, {
                status: "failed",
                error: errorMsg,
                completedAt: new Date().toISOString(),
              });
            }

            // 更新 Markdown 状态
            try {
              const currentContent = readFileSync(filePath, "utf-8");
              const updated = updateChecklistItemContent(
                currentContent,
                lineNumber,
                cleanDescriptionForAgent,
                true,
              );
              const final = updateProgressSection(updated);
              writeFileSync(filePath, final, "utf-8");
            } catch (e) {
              logger.error(`[ExecuteTaskList] 更新恢复任务的完成状态失败: ${e}`);
            }

            results.push({
              target: taskDesc,
              summary,
            });

            completedTaskIds.add(id);
            runningTaskIds.delete(id);
          })();
        }
      }

      while (true) {
        // 1. 查找就绪的任务
        const readyTasks = allTasks.filter((item) => {
          const id = getTaskId(item.description);
          if (!id) return false; // 忽略没有 ID 的项
          if (item.completed) return false; // 已完成
          if (runningTaskIds.has(id)) return false; // 正在运行

          // 检查依赖
          if (item.dependencies && item.dependencies.length > 0) {
            return item.dependencies.every((depId) => completedTaskIds.has(depId));
          }
          return true;
        });

        // 2. 如果没有就绪任务且没有正在运行的任务，说明执行完毕
        if (readyTasks.length === 0 && runningTaskIds.size === 0) {
          break;
        }

        // 3. 准备启动新任务
        const tasksToStart = readyTasks.slice(0, CONCURRENCY_LIMIT - runningTaskIds.size);

        if (tasksToStart.length > 0) {
          // 标记并启动任务
          for (const taskItem of tasksToStart) {
            const id = getTaskId(taskItem.description)!;
            runningTaskIds.add(id);

            // 异步执行任务，不阻塞循环
            (async () => {
              const { description, lineNumber } = taskItem;
              // 标记为 In Progress
              try {
                const currentContent = readFileSync(filePath, "utf-8");
                if (!description.includes("(In Progress)")) {
                  const updated = updateChecklistItemContent(
                    currentContent,
                    lineNumber,
                    `${description} (In Progress)`,
                    false,
                  );
                  writeFileSync(filePath, updated, "utf-8");
                }
              } catch (e) {
                logger.error(`[ExecuteTaskList] 标记任务开始失败: ${e}`);
              }

              const cleanDescriptionForAgent = description.replace(/\(In Progress\)$/, "").trim();
              const { cleanDescription, tools: requestedTools } =
                parseToolsFromDescription(cleanDescriptionForAgent);

              // 验证并准备工具
              const FORBIDDEN_SUB_TASK_TOOLS = [
                "createTaskDocs",
                "readTaskDocs",
                "updateTaskList",
                "getTaskListProgress",
                "executeTaskList",
              ];

              const availableTools: ToolInterface<any>[] = [];
              const invalidTools: string[] = [];
              const forbiddenTools: string[] = [];

              for (const toolName of requestedTools) {
                if (FORBIDDEN_SUB_TASK_TOOLS.includes(toolName)) {
                  forbiddenTools.push(toolName);
                  continue;
                }
                const tool = getToolByName(toolName) as ToolInterface<any> | undefined;
                if (tool) {
                  availableTools.push(tool);
                } else {
                  invalidTools.push(toolName);
                }
              }

              // 生成 prompt 并执行
              const subAgentPrompt = `你是一个专业的任务执行代理。
**任务目标：** ${cleanDescription}
**可用工具：** ${availableTools.length > 0 ? availableTools.map((t) => t.name).join(", ") : "基础工具"}
**设计参考：** ${designContent || "无设计文档"}
**执行要求：**
1. 专注完成任务目标
2. 使用提供的工具
3. 完成后使用 completionResult 返回结果`;

              let summary: string;
              try {
                const result = await taskOrchestrator.runSubTask({
                  subPrompt: subAgentPrompt,
                  parentId: taskId,
                  target: cleanDescription,
                  tools: availableTools,
                  taskDescription: cleanDescriptionForAgent,
                });
                summary = result.result;
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                summary = `任务执行失败: ${errorMsg}`;
                parentConv.updateSubTaskStatus(cleanDescriptionForAgent, {
                  status: "failed",
                  error: errorMsg,
                  completedAt: new Date().toISOString(),
                });
              }

              // 任务完成，更新状态
              try {
                const currentContent = readFileSync(filePath, "utf-8");
                const updated = updateChecklistItemContent(
                  currentContent,
                  lineNumber,
                  cleanDescriptionForAgent,
                  true,
                );
                const final = updateProgressSection(updated);
                writeFileSync(filePath, final, "utf-8");
              } catch (e) {
                logger.error(`[ExecuteTaskList] 更新任务完成状态失败: ${e}`);
              }

              results.push({
                target: cleanDescription,
                summary,
                invalidTools: invalidTools.length > 0 ? invalidTools : undefined,
              });

              completedTaskIds.add(id);
              runningTaskIds.delete(id);
            })();
          }
        }

        // 等待一段时间再检查就绪任务，或者直到有任务完成（这里简单使用 sleep）
        // 在实际生产中可能需要一个 EventEmitter 来通知任务完成
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const hasInvalidTools = results.some((r) => r.invalidTools);
      const totalTasksCount = parseResult.total;
      const completedCount = results.length;
      const uncompletedCount =
        totalTasksCount - completedCount - (parseResult.total - pendingTasks.length);

      let warningMessage = hasInvalidTools
        ? "\n⚠️ 警告：部分任务请求了不存在的工具，这些工具已被忽略。"
        : "";

      if (uncompletedCount > 0) {
        warningMessage += `\n⚠️ 警告：有 ${uncompletedCount} 个任务因依赖未满足或配置错误未被执行。`;
      }

      const executionMsg = `✅ 自动执行完成（${completedCount}/${pendingTasks.length}）${warningMessage}\n\n${results
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
