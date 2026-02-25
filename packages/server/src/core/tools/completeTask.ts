import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { logger } from "@/utils/logger";
import { conversationRepository } from "../conversation/ConversationRepository";
import { broadcaster } from "../conversation/WebSocketBroadcaster";
import {
  getTaskId,
  parseChecklist,
  updateChecklistItemContent,
  updateProgressSection,
} from "../templates/checklistParser";
import { createTool } from "./base";
import { getTaskDocsPath } from "./taskDocs/utils";

/**
 * 子任务完成工具
 * 用于子任务完成时自动更新父任务的 taskList，并标记任务结束
 */
export const CompleteTask = createTool({
  name: "completeTask",
  description:
    "🎯 【子任务专用】子任务完成后，使用此工具标记任务结束、返回最终结论，并自动更新父任务的待办列表。**这是子任务结束的唯一正确方式。**",
  whenToUse:
    "**关键规则：子任务完成后，必须使用此工具来结束任务。**\n\n" +
    "**工具功能：**\n" +
    "1. 自动定位并更新父任务 taskList 中对应的任务项（将 `[ ]` 改为 `[x]`）\n" +
    "2. 向父任务发送完成通知（包含摘要）\n" +
    "3. 标记子任务为完成状态\n" +
    "4. 返回任务完成结果给用户\n\n" +
    "**参数说明：**\n" +
    "- `summary`: 简短摘要（1-2句话），用于通知父任务\n" +
    "- `result`: 详细结果（Markdown 格式），这是返回给用户的主要内容\n" +
    "- `achievements`: （可选）关键成果，如：创建了3个文件、修复了2个bug\n" +
    "- `usage`: （可选）使用说明，如：运行 `npm start`、访问 http://localhost:3000\n\n" +
    "**格式要求：**\n" +
    "- ✅ `result` **必须使用 Markdown 格式**（标题、列表、代码块、加粗等）\n" +
    "- ✅ 使用合适的 Markdown 语法让内容结构清晰、易读\n" +
    "- ✅ 代码片段使用代码块（```）包裹\n" +
    "- ✅ 重要信息使用加粗（**文本**）或列表强调\n\n" +
    "**适用场景：**\n" +
    "1. 子任务已完成分配的工作\n" +
    "2. 需要向父任务报告完成结果\n" +
    "3. 所有必要的工作都已执行完毕\n\n" +
    "**严禁行为：**\n" +
    "- ❌ 使用 `completionResult` 工具（子任务不能使用）\n" +
    "- ❌ 直接向用户回复最终结论而不调用此工具\n" +
    "- ❌ 在任务未完成时调用此工具\n" +
    "- ❌ 输出纯文本而不使用 Markdown 格式\n\n" +
    "**工作原理：**\n" +
    "- 系统会自动从子任务上下文中获取父任务 ID 和任务索引\n" +
    "- 读取父任务的 taskList 文件\n" +
    "- 定位到对应的任务项并标记为完成\n" +
    "- 通知父任务更新进度（显示 summary）\n" +
    "- 结束子任务执行",
  useExamples: [
    `<completeTask>
  <summary>成功搜索到3个React组件库并提供了推荐</summary>
  <result>
## 搜索结果

找到了 3 个相关的 React 组件库：

1. **Material-UI (MUI)** - 最流行的 React UI 框架
   - 组件丰富，文档完善
   - 社区活跃，更新频繁
   
2. **Ant Design** - 企业级 UI 设计语言
   - 适合后台管理系统
   - 中文文档友好
   
3. **Chakra UI** - 简单、模块化的组件库
   - 易于定制
   - 无障碍支持好

## 推荐

推荐使用 **Material-UI**，因为它有最完善的文档和社区支持。
  </result>
  <achievements>找到3个主流组件库，提供了详细对比和推荐</achievements>
  <usage>可以通过 npm install @mui/material 安装使用</usage>
</completeTask>`,
    `<completeTask>
  <summary>完成代码审查，发现1个严重问题和3个改进建议</summary>
  <result>
## 代码审查完成

已完成对 \`UserService.ts\` 的审查。

### 🔴 严重问题

1. **SQL 注入风险**（第 45 行）
   \`\`\`typescript
   // ❌ 危险代码
   const query = \`SELECT * FROM users WHERE id = \${userId}\`;
   \`\`\`
   
   **修复建议：**
   \`\`\`typescript
   // ✅ 使用参数化查询
   const query = 'SELECT * FROM users WHERE id = ?';
   db.execute(query, [userId]);
   \`\`\`

### 💡 改进建议

1. 添加输入验证（第 32 行）
2. 增加错误处理（第 58 行）
3. 添加日志记录（第 71 行）

详细修改建议已记录在代码注释中。
  </result>
  <achievements>发现1个严重安全问题，提供3个改进建议</achievements>
  <usage>请优先修复 SQL 注入问题，然后逐步实施改进建议</usage>
</completeTask>`,
    `<completeTask>
  <summary>成功创建项目结构，包含5个目录和3个配置文件</summary>
  <result>
## 项目初始化完成

已创建以下项目结构：

\`\`\`
my-project/
├── src/           # 源代码目录
├── tests/         # 测试目录
├── docs/          # 文档目录
├── config/        # 配置目录
├── public/        # 静态资源
├── package.json   # 项目配置
├── tsconfig.json  # TypeScript 配置
└── .gitignore     # Git 忽略文件
\`\`\`

所有配置文件已按照最佳实践设置完成。
  </result>
  <achievements>创建5个目录，生成3个配置文件，初始化Git仓库</achievements>
  <usage>运行 npm install 安装依赖，然后 npm run dev 启动开发服务器</usage>
</completeTask>`,
  ],
  params: [
    {
      name: "summary",
      optional: false,
      description: "任务完成摘要，简短描述完成了什么（1-2句话）",
    },
    {
      name: "result",
      optional: false,
      description: "任务完成的详细结果，使用 Markdown 格式输出完整内容",
    },
    {
      name: "achievements",
      optional: true,
      description: "达到的效果或关键成果",
    },
    {
      name: "usage",
      optional: true,
      description: "如何使用结果的说明",
    },
  ],
  async invoke({ params, context }) {
    const { summary, result, achievements, usage } = params;
    const activeConversationStatuses = new Set([
      "streaming",
      "tool_executing",
      "waiting_tool_confirmation",
    ]);

    // 检查是否是子任务
    if (!context.parentId) {
      logger.error("[completeTask] 此工具只能在子任务中使用");
      return {
        message: "错误：completeTask 工具只能在子任务中使用",
        toolResult: "错误：completeTask 工具只能在子任务中使用",
      };
    }

    const subTaskId = context.taskId;
    const parentTaskId = context.parentId;

    logger.info(
      `[completeTask] 子任务 ${subTaskId} 完成，准备更新父任务 ${parentTaskId} 的 taskList`,
    );

    try {
      // 获取父任务（内存优先，不存在则从磁盘加载）
      const parentConversation =
        conversationRepository.get(parentTaskId) || conversationRepository.load(parentTaskId);
      if (!parentConversation) {
        logger.warn(`[completeTask] 未找到父任务 ${parentTaskId}`);
        // 即使找不到父任务，也返回结果
        return {
          message: "任务完成（警告：未找到父任务）",
          toolResult: result,
        };
      }

      // 从父任务的子任务状态中找到对应的任务索引
      const subTasks = parentConversation.memory.subTasks;
      let taskKey: string | undefined;
      let taskDescription: string | undefined;

      for (const [key, status] of Object.entries(subTasks)) {
        if (status.subTaskId === subTaskId) {
          taskKey = key;
          taskDescription = status.description;
          break;
        }
      }

      // 读取父任务的 taskList 文件
      const taskDocsPath = getTaskDocsPath(parentTaskId);
      const taskListPath = path.join(taskDocsPath, "taskList.md");

      let taskListContent = "";
      try {
        taskListContent = readFileSync(taskListPath, "utf-8");
      } catch (error) {
        logger.warn(`[completeTask] 无法读取父任务的 taskList 文件: ${error}`);
        return {
          message: "任务完成（警告：无法读取父任务 taskList）",
          toolResult: result,
        };
      }

      const normalizeDescription = (description: string) =>
        description.replace(/\(In Progress\)$/, "").trim();

      const parsed = parseChecklist(taskListContent);
      const normalizedTarget = taskDescription ? normalizeDescription(taskDescription) : undefined;
      let targetItem = normalizedTarget
        ? parsed.items.find((item) => normalizeDescription(item.description) === normalizedTarget)
        : undefined;

      if (!targetItem && taskKey) {
        targetItem = parsed.items.find((item) => getTaskId(item.description) === taskKey);
      }

      if (!targetItem) {
        logger.warn(`[completeTask] 未找到子任务 ${subTaskId} 对应的 taskList 项`);
        if (taskDescription || taskKey) {
          parentConversation.updateSubTaskStatus(taskDescription || taskKey || "", {
            status: "completed",
            completedAt: new Date().toISOString(),
            subTaskId,
          });
        }
        return {
          message: "任务完成（警告：未找到 taskList 项）",
          toolResult: result,
        };
      }

      const finalDescription = normalizedTarget || normalizeDescription(targetItem.description);
      parentConversation.updateSubTaskStatus(finalDescription, {
        status: "completed",
        completedAt: new Date().toISOString(),
        subTaskId,
      });
      const updatedContent = updateChecklistItemContent(
        taskListContent,
        targetItem.lineNumber,
        finalDescription,
        true,
      );
      const finalContent = updateProgressSection(updatedContent);

      // 写回文件
      writeFileSync(taskListPath, finalContent, "utf-8");
      logger.info(`[completeTask] 已更新父任务 ${parentTaskId} 的 taskList`);

      const parsedAfterComplete = parseChecklist(finalContent);
      const hasPendingTasks = parsedAfterComplete.items.some((item) => !item.completed);
      const parentIsRunning = activeConversationStatuses.has(parentConversation.status);
      const hasRunningSubTasks = Object.values(parentConversation.memory.subTasks).some(
        (subTaskStatus) =>
          subTaskStatus.status === "running" || subTaskStatus.status === "waiting_user_input",
      );

      if (hasPendingTasks && !parentIsRunning && !hasRunningSubTasks) {
        const executeTaskListTool =
          parentConversation.toolService.getToolFromName("executeTaskList");
        if (!executeTaskListTool) {
          logger.warn("[completeTask] 父任务缺少 executeTaskList 工具，无法自动续跑 taskList");
        } else {
          logger.info(
            `[completeTask] 父任务 ${parentTaskId} 当前未运行，自动触发 executeTaskList 继续执行剩余任务`,
          );
          try {
            await executeTaskListTool.invoke({
              params: {},
              context: {
                taskId: parentConversation.id,
                parentId: parentConversation.parentId,
                getSandbox: context.getSandbox,
                getToolByName: (name) => parentConversation.toolService.getToolFromName(name),
                signal: context.signal,
                postMessage: (msg: string | object) => {
                  broadcaster.postMessage(parentConversation, {
                    role: "assistant",
                    content: typeof msg === "string" ? msg : JSON.stringify(msg),
                    type: "message",
                    partial: true,
                  });
                },
              },
            });
          } catch (resumeError) {
            logger.error(
              `[completeTask] 自动触发父任务 executeTaskList 失败: ${
                resumeError instanceof Error ? resumeError.message : String(resumeError)
              }`,
            );
          }
        }
      }

      // 通知父任务
      const notificationMessage = [
        `✅ 子任务已完成：${summary}`,
        achievements ? `\n📊 成果：${achievements}` : "",
        usage ? `\n💡 使用方法：${usage}` : "",
      ]
        .filter(Boolean)
        .join("");

      broadcaster.broadcast(parentTaskId, {
        type: "alert",
        data: {
          message: notificationMessage,
          severity: "info",
          updateTime: Date.now(),
        },
      });

      return {
        message: "任务完成，已更新父任务待办列表",
        toolResult: result,
      };
    } catch (error) {
      logger.error(`[completeTask] 更新父任务 taskList 失败: ${error}`);
      // 即使更新失败，也返回结果
      return {
        message: `任务完成（警告：更新父任务失败 - ${error}）`,
        toolResult: result,
      };
    }
  },
});
