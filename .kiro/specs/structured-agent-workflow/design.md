# Design Document: Structured Agent Workflow

## Overview

本设计文档描述如何重塑 Amigo 主 Agent 的工作模式，使其按照结构化范式处理复杂任务。核心思想是将主 Agent 的工作流程标准化为四个阶段：需求分析、设计、任务拆分、执行与验收。每个阶段都会产出对应的文档，存储在沙箱的 `docs` 目录中。

### 设计目标

1. **可追溯性**: 所有决策和中间产物都有文档记录
2. **结构化**: 遵循固定的工作流程，确保任务处理的一致性
3. **灵活性**: 简单任务可以跳过完整流程
4. **可恢复性**: 支持中断后恢复工作流程

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Agent                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Workflow State Machine                       │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │    │
│  │  │ ANALYZE  │→ │  DESIGN  │→ │BREAKDOWN │→ │ EXECUTE  │ │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Document Manager                             │    │
│  │  • createTaskFolder()                                     │    │
│  │  • writeDocument(phase, content)                          │    │
│  │  • readDocument(phase)                                    │    │
│  │  • updateTaskList(taskId, status)                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Sandbox                                │    │
│  │  docs/                                                    │    │
│  │  └── {task-name}/                                         │    │
│  │      ├── requirements.md                                  │    │
│  │      ├── design.md                                        │    │
│  │      └── taskList.md                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Workflow Phase Enum

```typescript
enum WorkflowPhase {
  IDLE = 'idle',           // 初始状态
  ANALYZE = 'analyze',     // 需求分析阶段
  DESIGN = 'design',       // 设计阶段
  BREAKDOWN = 'breakdown', // 任务拆分阶段
  EXECUTE = 'execute',     // 执行阶段
  COMPLETE = 'complete'    // 完成状态
}
```

### 2. Task Context Interface

```typescript
interface TaskContext {
  taskId: string;           // 任务唯一标识
  taskName: string;         // 任务名称 (kebab-case)
  currentPhase: WorkflowPhase;
  docsPath: string;         // docs/{task-name}/
  documents: {
    requirements?: string;  // requirements.md 内容
    design?: string;        // design.md 内容
    taskList?: string;      // taskList.md 内容
  };
  isSimpleTask: boolean;    // 是否为简单任务
}
```

### 3. System Prompt 修改

主 Agent 的系统提示词需要增加工作流程指导：

```markdown
## STRUCTURED WORKFLOW

For complex tasks, follow this paradigm:

### Phase 1: Requirements Analysis
1. Analyze user intent
2. Create task folder: `docs/{task-name}/`
3. Write `requirements.md` with:
   - Task background
   - Core objectives
   - Constraints
   - Success criteria

### Phase 2: Design
1. Read requirements.md
2. Use tools to gather information (if needed)
3. Write `design.md` with:
   - Research findings
   - Solution approach
   - Technical decisions
   - Implementation strategy

### Phase 3: Task Breakdown
1. Read requirements.md and design.md
2. Write `taskList.md` with:
   - Checklist format: `- [ ]` / `- [x]`
   - Clear, actionable items
   - Dependencies noted

### Phase 4: Execution
1. Read taskList.md
2. Use assignTasks for parallel execution
3. Verify each completed task
4. Update taskList.md with `[x]`
5. Call completionResult when all done

### Simple Task Detection
Skip full workflow if:
- Task requires < 3 steps
- No external research needed
- Can be answered directly
```

### 4. 新增工具: createTaskDocs

用于在沙箱中创建和管理任务文档的工具：

```typescript
interface CreateTaskDocsParams {
  taskName: string;        // 任务名称，将转换为 kebab-case
  phase: 'requirements' | 'design' | 'taskList';
  content: string;         // 文档内容 (markdown)
}

interface CreateTaskDocsResult {
  success: boolean;
  filePath: string;        // 创建的文件路径
  message: string;
}
```

### 5. 新增工具: readTaskDocs

用于读取沙箱中的任务文档：

```typescript
interface ReadTaskDocsParams {
  taskName: string;
  phase: 'requirements' | 'design' | 'taskList' | 'all';
}

interface ReadTaskDocsResult {
  success: boolean;
  documents: {
    requirements?: string;
    design?: string;
    taskList?: string;
  };
  message: string;
}
```

### 6. 修改 updateTodolist 工具

增加工作流阶段追踪能力：

```typescript
// 在 todolist 中增加工作流阶段标记
const workflowTodoTemplate = `
- [ ] Phase 1: Requirements Analysis
  - [ ] Analyze user intent
  - [ ] Create task folder
  - [ ] Write requirements.md
- [ ] Phase 2: Design
  - [ ] Read requirements
  - [ ] Gather information
  - [ ] Write design.md
- [ ] Phase 3: Task Breakdown
  - [ ] Read requirements and design
  - [ ] Write taskList.md
- [ ] Phase 4: Execution
  - [ ] Execute tasks via assignTasks
  - [ ] Verify results
  - [ ] Update taskList.md
`;
```

## Data Models

### Document Templates

#### requirements.md Template

```markdown
# Task: {task-name}

## Background
{用户请求的背景和上下文}

## Objectives
{核心目标列表}
- Objective 1
- Objective 2

## Constraints
{限制条件}
- Constraint 1
- Constraint 2

## Success Criteria
{成功标准}
- [ ] Criterion 1
- [ ] Criterion 2
```

#### design.md Template

```markdown
# Design: {task-name}

## Research Findings
{信息收集的结果}

## Solution Approach
{解决方案概述}

## Technical Decisions
{技术决策及理由}

## Implementation Strategy
{实现策略}
```

#### taskList.md Template

```markdown
# Task List: {task-name}

## Dependencies
{任务依赖关系说明}

## Tasks

### Phase 1: {阶段名称}
- [ ] Task 1.1: {描述}
- [ ] Task 1.2: {描述}

### Phase 2: {阶段名称}
- [ ] Task 2.1: {描述} (depends on 1.1)
- [ ] Task 2.2: {描述} (parallel with 2.1)

## Progress
- Total: {n} tasks
- Completed: {m} tasks
- Remaining: {n-m} tasks
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Workflow Phase Ordering

*For any* workflow execution, phase transitions SHALL only occur in the order: IDLE → ANALYZE → DESIGN → BREAKDOWN → EXECUTE → COMPLETE, and no phase can be skipped (except when isSimpleTask is true).

**Validates: Requirements 1.3, 3.1, 4.1, 5.1**

### Property 2: Document Creation Location

*For any* document created during the workflow, it SHALL be located at `docs/{task-name}/{phase}.md` where task-name is in kebab-case format.

**Validates: Requirements 1.1, 1.2, 2.2, 3.3, 4.2, 6.1**

### Property 3: Document Structure Validation

*For any* requirements.md document, it SHALL contain sections: Background, Objectives, Constraints, and Success Criteria. *For any* design.md document, it SHALL contain sections: Research Findings, Solution Approach, Technical Decisions, and Implementation Strategy. *For any* taskList.md document, it SHALL contain a Tasks section with checklist items.

**Validates: Requirements 2.3, 2.4, 3.4, 4.3**

### Property 4: Task List Checklist Format

*For any* task item in taskList.md, it SHALL match the regex pattern `^- \[([ xX])\] .+$` where `[ ]` indicates pending and `[x]` or `[X]` indicates completed.

**Validates: Requirements 4.3, 5.4**

### Property 5: Phase Prerequisite Documents

*For any* phase transition to DESIGN, requirements.md SHALL exist and be readable. *For any* phase transition to BREAKDOWN, both requirements.md and design.md SHALL exist. *For any* phase transition to EXECUTE, taskList.md SHALL exist.

**Validates: Requirements 1.4, 3.1, 4.1, 5.1**

### Property 6: Sandbox Operation Conventions

*For any* document operation (create, read, update), it SHALL use shell commands executed in the sandbox environment, and all files SHALL be encoded in UTF-8.

**Validates: Requirements 6.2, 6.3, 6.4, 6.5**

### Property 7: Completion Behavior

*For any* workflow where all tasks in taskList.md are marked as `[x]`, the Main_Agent SHALL call completionResult to provide a summary.

**Validates: Requirements 5.6**

### Property 8: Simple Task Bypass

*For any* task determined to be simple (fewer than 3 steps, no external research needed), the workflow MAY skip document creation phases but SHALL still use completionResult for the final response.

**Validates: Requirements 8.1, 8.3, 8.4**

## Error Handling

### Phase Transition Errors

1. **Missing Prerequisite Document**: 如果尝试进入下一阶段但前置文档不存在，Agent 应该返回上一阶段完成文档创建
2. **Sandbox Write Failure**: 如果沙箱写入失败，Agent 应该重试或通知用户
3. **Document Parse Error**: 如果文档格式不正确，Agent 应该尝试修复或重新生成

### Execution Errors

1. **Sub-Agent Failure**: 如果子 Agent 执行失败，主 Agent 应该记录失败原因并决定是否重试
2. **Task Verification Failure**: 如果任务验收失败，主 Agent 应该更新 taskList.md 记录失败原因

### Recovery Scenarios

1. **Interrupted Workflow**: 通过读取现有文档恢复工作流状态
2. **Partial Completion**: 通过解析 taskList.md 中的 `[x]` 标记确定已完成的任务

## Testing Strategy

### Unit Tests

1. **kebab-case 转换**: 测试任务名称到 kebab-case 的转换
2. **文档模板生成**: 测试各阶段文档模板的生成
3. **Checklist 解析**: 测试 taskList.md 的解析和状态提取

### Property-Based Tests

使用 fast-check 进行属性测试：

1. **Property 1 Test**: 生成随机的工作流执行序列，验证阶段顺序
2. **Property 2 Test**: 生成随机任务名称，验证文档路径格式
3. **Property 3 Test**: 生成随机文档内容，验证必需节的存在
4. **Property 4 Test**: 生成随机 checklist 项，验证格式匹配
5. **Property 5 Test**: 模拟阶段转换，验证前置文档检查
6. **Property 7 Test**: 生成随机任务完成状态，验证 completionResult 调用
7. **Property 8 Test**: 生成随机任务复杂度，验证简单任务跳过逻辑

### Integration Tests

1. **完整工作流测试**: 模拟从用户请求到任务完成的完整流程
2. **中断恢复测试**: 模拟工作流中断和恢复
3. **沙箱操作测试**: 验证文档在沙箱中的创建、读取、更新

## Implementation Notes

### 实现优先级

1. **P0**: 修改主 Agent 系统提示词，引入结构化工作流概念
2. **P0**: 实现 createTaskDocs 和 readTaskDocs 工具
3. **P1**: 修改 updateTodolist 支持工作流阶段追踪
4. **P2**: 实现简单任务检测逻辑
5. **P2**: 实现工作流恢复功能

### 兼容性考虑

- 现有的 assignTasks 和 completionResult 工具保持不变
- 子 Agent 的工作模式暂时不修改
- 沙箱功能依赖现有的 Sandbox 类实现
