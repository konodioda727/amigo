# Requirements Document

## Introduction

本功能旨在重塑 Amigo 主 Agent 的工作模式，使其按照结构化的范式来处理复杂任务。主 Agent 将遵循一个标准化的工作流程：需求分析 → 信息收集与设计 → 任务拆分 → 执行与验收。所有中间产物（文档）将存储在沙箱的 `docs` 文件夹中，形成可追溯的任务处理记录。

## Glossary

- **Main_Agent**: 主代理，负责接收用户请求并协调整个任务处理流程
- **Sub_Agent**: 子代理，负责执行具体的子任务
- **Sandbox**: 沙箱环境，提供隔离的文件系统用于存储任务文档
- **Task_Folder**: 任务文件夹，以任务名称命名，存储该任务的所有相关文档
- **Requirements_Doc**: 需求文档，记录用户意图的分析和拆解结果
- **Design_Doc**: 设计文档，记录信息收集结果和实现思路
- **TaskList_Doc**: 任务列表文档，记录细化后的执行步骤
- **Workflow_Phase**: 工作流阶段，包括需求分析、设计、任务拆分、执行四个阶段

## Requirements

### Requirement 1: 结构化工作流程

**User Story:** As a user, I want the main agent to follow a structured workflow paradigm, so that complex tasks are handled systematically with clear documentation.

#### Acceptance Criteria

1. WHEN a user submits a complex request, THE Main_Agent SHALL analyze the request and create a Task_Folder in the sandbox's `docs` directory
2. WHEN creating a Task_Folder, THE Main_Agent SHALL name it based on the task's core objective using kebab-case format
3. THE Main_Agent SHALL follow the workflow phases in order: requirements analysis → design → task breakdown → execution
4. WHEN transitioning between Workflow_Phases, THE Main_Agent SHALL complete the current phase's documentation before proceeding
5. IF a Workflow_Phase fails or produces incomplete results, THEN THE Main_Agent SHALL retry or ask for user clarification

### Requirement 2: 需求分析阶段

**User Story:** As a user, I want the agent to clearly document my requirements, so that the subsequent work is based on accurate understanding.

#### Acceptance Criteria

1. WHEN entering the requirements analysis phase, THE Main_Agent SHALL analyze and decompose the user's intent
2. THE Main_Agent SHALL create a `requirements.md` file in the Task_Folder
3. WHEN writing Requirements_Doc, THE Main_Agent SHALL include: task background, core objectives, constraints, and success criteria
4. THE Requirements_Doc SHALL be written in a structured format with clear sections
5. WHEN requirements are ambiguous, THE Main_Agent SHALL use askFollowupQuestion to clarify before documenting

### Requirement 3: 设计阶段

**User Story:** As a user, I want the agent to research and design a solution, so that the implementation is well-planned.

#### Acceptance Criteria

1. WHEN entering the design phase, THE Main_Agent SHALL read the Requirements_Doc first
2. THE Main_Agent SHALL use available tools (webSearch, browserSearch, etc.) to gather relevant information
3. THE Main_Agent SHALL create a `design.md` file in the Task_Folder
4. WHEN writing Design_Doc, THE Main_Agent SHALL include: research findings, solution approach, technical decisions, and implementation strategy
5. THE Design_Doc SHALL reference specific findings from the information gathering step
6. IF no external tools are available, THEN THE Main_Agent SHALL proceed with design based on its knowledge and clearly state assumptions

### Requirement 4: 任务拆分阶段

**User Story:** As a user, I want the agent to break down the work into clear steps, so that progress can be tracked and verified.

#### Acceptance Criteria

1. WHEN entering the task breakdown phase, THE Main_Agent SHALL read both Requirements_Doc and Design_Doc
2. THE Main_Agent SHALL create a `taskList.md` file in the Task_Folder
3. WHEN writing TaskList_Doc, THE Main_Agent SHALL use markdown checklist format with `- [ ]` for pending and `- [x]` for completed items
4. EACH task item in TaskList_Doc SHALL be specific, actionable, and independently verifiable
5. THE TaskList_Doc SHALL include task dependencies and execution order when applicable
6. WHEN tasks can be parallelized, THE Main_Agent SHALL mark them accordingly

### Requirement 5: 执行与验收阶段

**User Story:** As a user, I want the agent to execute tasks and verify results, so that I receive quality outcomes.

#### Acceptance Criteria

1. WHEN entering the execution phase, THE Main_Agent SHALL read the TaskList_Doc to determine pending tasks
2. THE Main_Agent SHALL use assignTasks tool to delegate tasks to Sub_Agents
3. WHEN a Sub_Agent completes a task, THE Main_Agent SHALL verify the result against the task's success criteria
4. WHEN a task is verified as complete, THE Main_Agent SHALL update the TaskList_Doc to mark it as `[x]`
5. IF a task fails verification, THEN THE Main_Agent SHALL either retry or document the failure reason
6. WHEN all tasks are complete, THE Main_Agent SHALL provide a summary using completionResult

### Requirement 6: 沙箱文档管理

**User Story:** As a user, I want all task documents stored in an organized manner, so that I can review the agent's work process.

#### Acceptance Criteria

1. THE Main_Agent SHALL create all task documents within the sandbox's `docs/{task-name}/` directory
2. WHEN creating documents, THE Main_Agent SHALL use shell commands to write files in the sandbox
3. THE Main_Agent SHALL be able to read existing documents from the sandbox to resume work
4. WHEN updating documents, THE Main_Agent SHALL preserve the document structure and only modify relevant sections
5. THE document encoding SHALL be UTF-8 to support multiple languages

### Requirement 7: 工作流状态追踪

**User Story:** As a user, I want to know which phase the agent is in, so that I understand the progress.

#### Acceptance Criteria

1. THE Main_Agent SHALL maintain awareness of the current Workflow_Phase
2. WHEN starting a new phase, THE Main_Agent SHALL briefly inform the user of the transition
3. THE Main_Agent SHALL use updateTodolist to track overall workflow progress
4. IF the user interrupts with a new request, THEN THE Main_Agent SHALL handle it appropriately (pause current workflow or start new one)
5. WHEN resuming an interrupted workflow, THE Main_Agent SHALL read existing documents to restore context

### Requirement 8: 简单任务处理

**User Story:** As a user, I want simple tasks to be handled efficiently without unnecessary overhead, so that quick questions get quick answers.

#### Acceptance Criteria

1. WHEN a user request is simple and can be answered directly, THE Main_Agent SHALL skip the full workflow
2. THE Main_Agent SHALL determine task complexity based on: number of steps required, need for external information, and execution time estimate
3. IF a task requires fewer than 3 steps and no external research, THEN THE Main_Agent MAY proceed without creating documentation
4. WHEN skipping the full workflow, THE Main_Agent SHALL still use appropriate tools (askFollowupQuestion, completionResult)
