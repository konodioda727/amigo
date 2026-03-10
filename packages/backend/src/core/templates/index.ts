/**
 * 文档模板模块
 * 提供结构化工作流中各阶段文档的模板生成功能
 */

// 导出 checklist 解析器
export * from "./checklistParser";

import { parseDependenciesFromDescription } from "./checklistParser";

/**
 * 文档模板类型
 */
export type DocumentPhase = "requirements" | "design" | "taskList";

/**
 * 需求文档模板参数
 */
export interface RequirementsTemplateParams {
  taskName: string;
  background?: string;
  objectives?: string[];
  constraints?: string[];
  successCriteria?: string[];
}

/**
 * 设计文档模板参数
 */
export interface DesignTemplateParams {
  taskName: string;
  researchFindings?: string;
  solutionApproach?: string;
  technicalDecisions?: string;
  implementationStrategy?: string;
  subTaskCollaboration?: string;
}

/**
 * 任务项 interface
 */
export interface TaskItem {
  id: string;
  description: string;
  completed: boolean;
  dependencies?: string[];
  parallel?: string[];
}

/**
 * 任务阶段 interface
 */
export interface TaskPhase {
  name: string;
  tasks: TaskItem[];
}

/**
 * 任务列表文档模板参数
 */
export interface TaskListTemplateParams {
  taskName: string;
  dependencies?: string;
  phases?: TaskPhase[];
}

/**
 * 必需的文档节
 */
export const REQUIRED_SECTIONS = {
  requirements: ["Background", "Objectives", "Constraints", "Success Criteria"],
  design: [
    "Research Findings",
    "Solution Approach",
    "Technical Decisions",
    "Implementation Strategy",
    "SubTask Collaboration Contract",
  ],
  taskList: ["Tasks"],
} as const;

/**
 * 生成需求文档模板
 * @param params 模板参数
 * @returns 格式化的 Markdown 文档
 */
export function generateRequirementsTemplate(params: RequirementsTemplateParams): string {
  const {
    taskName,
    background = "{用户请求的背景和上下文}",
    objectives = ["{目标 1}", "{目标 2}"],
    constraints = ["{限制条件 1}", "{限制条件 2}"],
    successCriteria = ["{成功标准 1}", "{成功标准 2}"],
  } = params;

  const objectivesList = objectives.map((obj) => `- ${obj}`).join("\n");
  const constraintsList = constraints.map((c) => `- ${c}`).join("\n");
  const criteriaList = successCriteria.map((c) => `- [ ] ${c}`).join("\n");

  return `# Task: ${taskName}

## Background
${background}

## Objectives
${objectivesList}

## Constraints
${constraintsList}

## Success Criteria
${criteriaList}
`;
}

/**
 * 生成设计文档模板
 * @param params 模板参数
 * @returns 格式化的 Markdown 文档
 */
export function generateDesignTemplate(params: DesignTemplateParams): string {
  const {
    taskName,
    researchFindings = "{信息收集的结果}",
    solutionApproach = "{解决方案概述}",
    technicalDecisions = "{技术决策及理由}",
    implementationStrategy = "{实现策略}",
    subTaskCollaboration = `### Ownership
- 主任务负责定义并维护 subTask 协作规范，subTask 不得自行改写。

### Process Docs
- 文档位置：{例如 taskDocs/process/}
- 文档清单：{例如 handoff.md, decisions.md, progress.md}

### Naming Convention
- 目录与文件命名：{例如 kebab-case}
- 任务条目命名：{例如 "Task X.Y: 动作 + 对象 + 输出"}

### Collaboration Protocol
- 输入格式：{subTask 接收的信息结构}
- 输出格式：{subTask 完成结果结构}
- 状态同步：{更新频率、更新位置、冲突处理}

### Handoff Rules
- 完成定义：{何时视为完成}
- 交付清单：{必须提交的文档/产物}
- 异常升级：{无法继续时如何上报主任务}`,
  } = params;

  return `# Design: ${taskName}

## Research Findings
${researchFindings}

## Solution Approach
${solutionApproach}

## Technical Decisions
${technicalDecisions}

## Implementation Strategy
${implementationStrategy}

## SubTask Collaboration Contract
${subTaskCollaboration}
`;
}

/**
 * 格式化单个任务项
 * @param task 任务项
 * @returns 格式化的任务行
 */
function formatTaskItem(task: TaskItem): string {
  const checkbox = task.completed ? "[x]" : "[ ]";
  let line = `- ${checkbox} Task ${task.id}: ${task.description}`;

  if (task.dependencies && task.dependencies.length > 0) {
    line += ` [deps: ${task.dependencies.join(", ")}]`;
  } else if (task.parallel && task.parallel.length > 0) {
    line += ` (parallel with ${task.parallel.join(", ")})`;
  }

  return line;
}

/**
 * 生成任务列表文档模板
 * @param params 模板参数
 * @returns 格式化的 Markdown 文档
 */
export function generateTaskListTemplate(params: TaskListTemplateParams): string {
  const {
    taskName,
    dependencies = "{任务依赖关系说明}",
    phases = [
      {
        name: "{阶段名称}",
        tasks: [
          { id: "1.1", description: "{描述}", completed: false },
          { id: "1.2", description: "{描述}", completed: false },
        ],
      },
    ],
  } = params;

  // 计算进度统计
  let totalTasks = 0;
  let completedTasks = 0;

  for (const phase of phases) {
    for (const task of phase.tasks) {
      totalTasks++;
      if (task.completed) {
        completedTasks++;
      }
    }
  }

  const remainingTasks = totalTasks - completedTasks;

  // 生成阶段内容
  const phasesContent = phases
    .map((phase, index) => {
      const phaseNumber = index + 1;
      const tasksContent = phase.tasks.map(formatTaskItem).join("\n");
      return `### Phase ${phaseNumber}: ${phase.name}\n${tasksContent}`;
    })
    .join("\n\n");

  return `# Task List: ${taskName}

## Dependencies
${dependencies}

## Tasks

${phasesContent}

## Progress
- Total: ${totalTasks} tasks
- Completed: ${completedTasks} tasks
- Remaining: ${remainingTasks} tasks
`;
}

/**
 * 根据阶段类型生成对应的文档模板
 * @param phase 文档阶段类型
 * @param taskName 任务名称
 * @returns 格式化的 Markdown 文档
 */
export function generateTemplate(phase: DocumentPhase, taskName: string): string {
  switch (phase) {
    case "requirements":
      return generateRequirementsTemplate({ taskName });
    case "design":
      return generateDesignTemplate({ taskName });
    case "taskList":
      return generateTaskListTemplate({ taskName });
    default:
      throw new Error(`Unknown document phase: ${phase}`);
  }
}

/**
 * 验证文档是否包含必需的节
 * @param content 文档内容
 * @param phase 文档阶段类型
 * @returns 验证结果，包含是否有效和缺失的节
 */
export function validateDocumentStructure(
  content: string,
  phase: DocumentPhase,
): { valid: boolean; missingSections: string[] } {
  const requiredSections = REQUIRED_SECTIONS[phase];
  const missingSections: string[] = [];

  for (const section of requiredSections) {
    // 使用正则匹配 ## Section Name 格式
    const sectionPattern = new RegExp(`^##\\s+${escapeRegExp(section)}\\s*$`, "m");
    if (!sectionPattern.test(content)) {
      missingSections.push(section);
    }
  }

  return {
    valid: missingSections.length === 0,
    missingSections,
  };
}

/**
 * 转义正则表达式特殊字符
 * @param str 输入字符串
 * @returns 转义后的字符串
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 解析任务列表文档中的任务项
 * @param content 文档内容
 * @returns 解析出的任务项数组
 */
export function parseTaskListItems(
  content: string,
): { id: string; description: string; completed: boolean; dependencies: string[] }[] {
  const tasks: { id: string; description: string; completed: boolean; dependencies: string[] }[] =
    [];

  // 匹配 checklist 格式: - [ ] Task X.Y: description 或 - [x] Task X.Y: description
  // 同时也捕获末尾的 [deps: ...]
  const taskPattern = /^-\s+\[([ xX])\]\s+Task\s+([\d.]+):\s*(.+?)$/gm;

  let match: RegExpExecArray | null = taskPattern.exec(content);
  while (match !== null) {
    const checkmark = match[1];
    const id = match[2];
    const rawDescription = match[3] || "";

    if (id && rawDescription && checkmark) {
      const dependencies = parseDependenciesFromDescription(rawDescription);
      // 清理描述，去掉依赖部分
      const description = rawDescription.replace(/\[deps:\s*[^\]]+\]/i, "").trim();

      tasks.push({
        id,
        description,
        completed: checkmark.toLowerCase() === "x",
        dependencies,
      });
    }
    match = taskPattern.exec(content);
  }

  return tasks;
}

/**
 * 计算任务列表的进度
 * @param content 文档内容
 * @returns 进度统计
 */
export function calculateTaskProgress(content: string): {
  total: number;
  completed: number;
  remaining: number;
  percentage: number;
} {
  const tasks = parseTaskListItems(content);
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const remaining = total - completed;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, remaining, percentage };
}

/**
 * 更新任务列表中指定任务的状态
 * @param content 文档内容
 * @param taskId 任务 ID
 * @param completed 是否完成
 * @returns 更新后的文档内容
 */
export function updateTaskStatus(content: string, taskId: string, completed: boolean): string {
  const escapedId = escapeRegExp(taskId);
  const pattern = new RegExp(`^(-\\s+\\[)[ xX](\\]\\s+Task\\s+${escapedId}:.*)$`, "gm");

  const newCheckmark = completed ? "x" : " ";
  let updatedContent = content.replace(pattern, `$1${newCheckmark}$2`);

  // 更新进度统计
  const progress = calculateTaskProgress(updatedContent);
  updatedContent = updatedContent.replace(
    /^- Total: \d+ tasks$/m,
    `- Total: ${progress.total} tasks`,
  );
  updatedContent = updatedContent.replace(
    /^- Completed: \d+ tasks$/m,
    `- Completed: ${progress.completed} tasks`,
  );
  updatedContent = updatedContent.replace(
    /^- Remaining: \d+ tasks$/m,
    `- Remaining: ${progress.remaining} tasks`,
  );

  return updatedContent;
}
