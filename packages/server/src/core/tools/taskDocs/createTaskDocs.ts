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
    "3. **taskList:** 记录执行步骤。注意：在 taskList 中，如果任务之间有依赖关系，请在任务描述末尾使用 `[deps: X.Y]` 格式注明，以便进行拓扑排序。\n" +
    "\n" +
    "**内容要求：**\n" +
    "- 文档内容要具体、可执行，避免一句话概括\n" +
    "- requirements/design 必须包含清晰的目标、约束和验收标准\n" +
    "- design 内容深度需匹配任务类型（通用任务强调方法与验证；编程任务强调接口/数据模型/错误处理/测试/权衡）\n" +
    "- design 必须由主任务定义 subTask 协作契约：过程文档位置、命名规范、输入输出与交接规范\n" +
    "- taskList 每条任务要包含上下文、涉及文件/路径、预期输出\n",

  useExamples: [
    `<createTaskDocs>
  <phase>requirements</phase>
  <content># Requirements

## Background
需要为现有的 Web 应用增加安全的登录能力，当前只有匿名访问。

## Objectives
- 支持用户名/密码登录
- 支持 7 天内自动登录（可配置）
- 登录失败给出明确错误信息

## Constraints
- 不引入新的数据库（必须复用现有用户表）
- 兼容现有前端路由

## Success Criteria
- 用户可在 3 次内完成登录
- 未登录访问受保护路由时会被重定向
  </content>
</createTaskDocs>`,
    `<createTaskDocs>
  <phase>taskList</phase>
  <content># Task List

## Tasks

### Phase 1: 基础实现
- [ ] Task 1.1: 在 packages/server/src/api/report.ts 增加查询接口，返回分页 JSON（包含 total/items）[tools: readFile, editFile]
- [ ] Task 1.2: 在 packages/server/src/api/report.ts 增加 CSV 导出能力，复用查询结果并添加列头 [tools: editFile, deps: 1.1]

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
