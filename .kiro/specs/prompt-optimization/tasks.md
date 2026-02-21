# Implementation Plan: Prompt Optimization

## Overview

重构系统提示词，采用 Roo 风格的清晰结构。按模块逐步创建新文件，最后更新组装逻辑。

## Tasks

- [x] 1. 创建共享模块
  - [x] 1.1 创建 `shared/critical-rules.md` - 关键规则文件
    - 包含两条硬性约束：单次工具调用、任务完成标记
    - 使用 `====` 分隔符
    - 每条规则 < 50 词
    - _Requirements: 1.1, 1.2, 1.4, 5.1, 5.2_
  - [x] 1.2 创建 `shared/tool-guide.md` - 精简版工具指南
    - 工具选择优先级决策树
    - XML 格式简要说明
    - 常见错误（每条最多 1 个 bad case）
    - 控制在 200 行以内
    - _Requirements: 2.2, 3.1, 3.2, 3.4_

- [x] 2. 创建主 Agent 模块
  - [x] 2.1 创建 `main/identity.md` - 主 Agent 身份定义
    - 角色定义、目标、工作流程
    - 简洁风格，无冗余解释
    - _Requirements: 1.4, 2.1, 4.1_
  - [x] 2.2 重写 `main/rules.md` - 主 Agent 专属规则
    - 任务管理、用户沟通、工具优先原则
    - 移除与共享模块重复的内容
    - 使用 bullet points
    - _Requirements: 2.1, 2.3, 2.4, 4.1_

- [x] 3. 创建子 Agent 模块
  - [x] 3.1 创建 `sub/identity.md` - 子 Agent 身份定义
    - 执行者角色、技术风格
    - 比主 Agent 更简洁
    - _Requirements: 1.4, 4.2, 4.4_
  - [x] 3.2 重写 `sub/rules.md` - 子 Agent 专属规则
    - 执行焦点、结果报告
    - 移除规划相关内容
    - _Requirements: 2.1, 2.3, 4.2, 4.4_

- [x] 4. 更新组装逻辑
  - [x] 4.1 更新 `index.ts` - 修改提示词组装顺序
    - 共享模块置顶
    - 按新结构组装
    - 添加文件存在性检查
    - _Requirements: 1.2, 5.1_

- [x] 5. 清理旧文件
  - [x] 5.1 删除旧的 `main/objective.md` 和 `sub/objective.md`
    - 内容已合并到新模块
    - _Requirements: 1.3_
  - [x] 5.2 删除旧的 `tooluseGuide.md`
    - 内容已合并到 `shared/tool-guide.md`
    - _Requirements: 1.3, 3.3_

- [ ] 6. Checkpoint - 验证提示词生成
  - 确保所有文件正确加载
  - 确保提示词结构符合设计
  - 手动检查生成的提示词内容

- [ ]* 7. 属性测试
  - [ ]* 7.1 编写结构验证测试
    - **Property 1: Prompt Structure Validation**
    - **Validates: Requirements 1.1, 1.2, 5.1**
  - [ ]* 7.2 编写规则简洁性测试
    - **Property 2: Rule Conciseness**
    - **Validates: Requirements 1.4**
  - [ ]* 7.3 编写示例数量测试
    - **Property 3: Example Count Per Rule**
    - **Validates: Requirements 2.2, 3.2**
  - [ ]* 7.4 编写冗余检测测试
    - **Property 4: No Redundant Explanations**
    - **Validates: Requirements 2.1**
  - [ ]* 7.5 编写行数测试
    - **Property 5: Tool Guide Line Count**
    - **Validates: Requirements 3.4**
  - [ ]* 7.6 编写长度对比测试
    - **Property 6: Sub Prompt Shorter Than Main**
    - **Validates: Requirements 4.4**

- [ ] 8. Final Checkpoint
  - 确保所有测试通过
  - 确保提示词符合设计规范

## Notes

- 任务 7 标记为可选（`*`），可在核心功能完成后执行
- 每个任务引用具体的需求条款以确保可追溯性
- Checkpoint 任务用于阶段性验证
