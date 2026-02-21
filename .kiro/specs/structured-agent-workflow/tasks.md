# Implementation Plan: Structured Agent Workflow

## Overview

本实现计划将结构化工作流功能分解为可执行的任务，按照优先级和依赖关系组织。实现将使用 TypeScript，遵循现有的代码风格和架构模式。

## Tasks

- [x] 1. 定义工作流类型和接口
  - 创建 WorkflowPhase 枚举和 TaskContext 接口
  - 在 `packages/types/src/workflow/` 目录下创建类型定义
  - _Requirements: 1.3, 7.1_

- [x] 2. 实现文档管理工具
  - [x] 2.1 实现 createTaskDocs 工具
    - 在 `packages/server/src/core/tools/` 下创建 `taskDocs.ts`
    - 实现任务名称到 kebab-case 的转换
    - 实现在沙箱中创建文档的逻辑
    - _Requirements: 1.1, 1.2, 2.2, 3.3, 4.2, 6.1, 6.2_
  - [x] 2.2 实现 readTaskDocs 工具
    - 在同一文件中添加读取文档的工具
    - 支持读取单个文档或所有文档
    - _Requirements: 6.3, 7.5_
  - [x] 2.3 编写 createTaskDocs 属性测试
    - **Property 2: Document Creation Location**
    - **Validates: Requirements 1.1, 1.2, 2.2, 3.3, 4.2, 6.1**
  - [ ]* 2.4 编写 readTaskDocs 单元测试
    - 测试读取存在和不存在的文档
    - _Requirements: 6.3_

- [x] 3. 实现文档模板生成
  - [x] 3.1 创建文档模板模块
    - 在 `packages/server/src/core/templates/` 下创建模板文件
    - 实现 requirements.md、design.md、taskList.md 模板
    - _Requirements: 2.3, 2.4, 3.4, 4.3_
  - [ ]* 3.2 编写文档结构验证属性测试
    - **Property 3: Document Structure Validation**
    - **Validates: Requirements 2.3, 2.4, 3.4, 4.3**

- [x] 4. 实现 taskList 解析和更新
  - [x] 4.1 实现 checklist 解析器
    - 解析 `- [ ]` 和 `- [x]` 格式
    - 提取任务状态和进度
    - _Requirements: 4.3, 5.4_
  - [x] 4.2 实现 taskList 更新功能
    - 支持标记任务为完成
    - 更新进度统计
    - _Requirements: 5.4_
  - [ ]* 4.3 编写 checklist 格式属性测试
    - **Property 4: Task List Checklist Format**
    - **Validates: Requirements 4.3, 5.4**

- [-] 5. 你之前的实现有偏差
  - [-] 5.1 实现工作流阶段管理
    - [ ] 5.1.1 创建 editFile 工具
      - 创建 editFile 工具，支持全量创建文件、修改文件特定行数内容
    - _Requirements: 5.2, 5.3_
    - [ ] 5.1.2 创建 readFile 工具
      - 可以输入文件路径，阅读相应文件
      - _Requirements: 5.1, 5.5_
    - [x] 5.1.3 创建 bash 工具
     - 可以通过 bash 工具执行 bash 命令，查看文件目录等
    
- [x] 6. 修改主 Agent 系统提示词
  - [x] 6.1 创建工作流指导提示词
    - 在 `packages/server/src/core/systemPrompt/main/` 下创建 `workflow.md`
    - 定义四个阶段的具体步骤
    - _Requirements: 1.3, 1.4, 2.1, 3.1, 4.1, 5.1_
  - [x] 6.2 更新系统提示词组装逻辑
    - 修改 `packages/server/src/core/systemPrompt/index.ts`
    - 将工作流指导加入主 Agent 提示词
    - _Requirements: 1.3_
  - [ ]* 6.3 编写工作流阶段顺序属性测试
    - **Property 1: Workflow Phase Ordering**
    - **Validates: Requirements 1.3, 3.1, 4.1, 5.1**

- [ ] 7. 实现简单任务检测
  - [ ] 7.1 创建任务复杂度评估模块
    - 在 `packages/server/src/core/workflow/` 下创建 `complexity.ts`
    - 实现基于步骤数和研究需求的评估逻辑
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ]* 7.2 编写简单任务跳过属性测试
    - **Property 8: Simple Task Bypass**
    - **Validates: Requirements 8.1, 8.3, 8.4**

- [x] 8. 注册新工具到工具服务
  - 修改 `packages/server/src/core/tools/index.ts`
  - 将 createTaskDocs 和 readTaskDocs 添加到 BASIC_TOOLS
  - _Requirements: 2.2, 3.3, 4.2_

- [ ] 9. Checkpoint - 确保集成正确
  - 运行所有测试，确保通过
  - 如有问题，询问用户

- [ ] 10. 实现工作流恢复功能
  - [ ] 10.1 实现工作流状态检测
    - 通过检查现有文档确定当前阶段
    - _Requirements: 7.5_
  - [ ] 10.2 实现恢复逻辑
    - 读取现有文档恢复上下文
    - 从中断点继续执行
    - _Requirements: 7.5_
  - [ ]* 10.3 编写阶段前置文档属性测试
    - **Property 5: Phase Prerequisite Documents**
    - **Validates: Requirements 1.4, 3.1, 4.1, 5.1**

- [ ] 11. 将更新 updateTodolist 工具
  - 增加工作流阶段追踪模板
  - 支持阶段级别的进度追踪
  - _Requirements: 7.3_

- [ ] 12. 实现完成行为验证
  - [ ] 12.1 在执行阶段添加完成检测
    - 检查所有任务是否标记为 `[x]`
    - 自动触发 completionResult
    - _Requirements: 5.6_
  - [ ]* 12.2 编写完成行为属性测试
    - **Property 7: Completion Behavior**
    - **Validates: Requirements 5.6**

- [ ] 13. Final Checkpoint - 完整功能验证
  - 运行所有测试，确保通过
  - 手动测试完整工作流
  - 如有问题，询问用户

## Notes

- 标记为 `*` 的任务是可选的测试任务，可以跳过以加快 MVP 开发
- 每个任务都引用了具体的需求条款以确保可追溯性
- Checkpoint 任务用于阶段性验证，确保增量开发的正确性
- 属性测试验证设计文档中定义的正确性属性
