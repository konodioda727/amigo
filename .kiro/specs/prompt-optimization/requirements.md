# Requirements Document

## Introduction

优化 Amigo 系统提示词，解决当前提示词层次混乱、描述冗长、bad case 过多的问题。参考 Roo 的提示词风格，重构为清晰、简洁、高效的格式。

## Glossary

- **Main_Agent**: 主智能体，负责任务规划、分解和协调
- **Sub_Agent**: 子智能体，负责执行具体任务
- **Tool**: 工具，Agent 通过 XML 格式调用的功能模块
- **completionResult**: 任务完成工具，标记任务结束的唯一正确方式
- **System_Prompt**: 系统提示词，指导 Agent 行为的核心指令

## Requirements

### Requirement 1: 提示词结构重组

**User Story:** As a developer, I want the system prompts to have a clear hierarchical structure, so that the AI can quickly understand and follow the rules.

#### Acceptance Criteria

1. THE System_Prompt SHALL use `====` separators to divide major sections (Identity, Rules, Tools, etc.)
2. THE System_Prompt SHALL organize rules by priority: Critical Rules → Important Principles → Best Practices
3. THE System_Prompt SHALL consolidate duplicate content across main/sub prompts into shared modules
4. THE System_Prompt SHALL keep each rule statement under 50 words

### Requirement 2: 规则精简

**User Story:** As a developer, I want concise rule descriptions, so that the AI can process instructions efficiently without context overflow.

#### Acceptance Criteria

1. THE System_Prompt SHALL remove redundant "why this matters" explanations
2. THE System_Prompt SHALL limit bad case examples to maximum 1 per rule
3. THE System_Prompt SHALL use bullet points instead of paragraphs for rule lists
4. WHEN a rule is stated, THE System_Prompt SHALL NOT repeat the same rule in different sections

### Requirement 3: 工具使用指南优化

**User Story:** As a developer, I want a streamlined tool usage guide, so that the AI can correctly invoke tools without excessive documentation.

#### Acceptance Criteria

1. THE Tool_Guide SHALL present tool selection as a simple decision tree
2. THE Tool_Guide SHALL provide exactly 1 correct example and 1 incorrect example per critical rule
3. THE Tool_Guide SHALL remove XML format documentation that duplicates tool definitions
4. THE Tool_Guide SHALL consolidate into a single concise section (under 200 lines)

### Requirement 4: Main/Sub Agent 差异化

**User Story:** As a developer, I want clear differentiation between main and sub agent prompts, so that each agent type has focused instructions.

#### Acceptance Criteria

1. THE Main_Agent prompt SHALL focus on planning, delegation, and user communication
2. THE Sub_Agent prompt SHALL focus on execution and result reporting
3. WHEN rules are identical for both agents, THE System_Prompt SHALL use a shared module
4. THE Sub_Agent prompt SHALL be shorter than Main_Agent prompt by removing planning-related content

### Requirement 5: 关键规则强化

**User Story:** As a developer, I want critical rules to be prominently displayed, so that the AI never violates them.

#### Acceptance Criteria

1. THE System_Prompt SHALL place the 2 critical rules (single tool call, completionResult) at the very top
2. THE System_Prompt SHALL use a consistent format: `MUST` for required, `NEVER` for forbidden
3. THE System_Prompt SHALL NOT bury critical rules within long paragraphs
4. WHEN listing forbidden behaviors, THE System_Prompt SHALL keep the list under 10 items
