# Requirements Document

## Introduction

本文档定义了 Amigo AI Agent 系统提示词优化的需求。当前系统存在 AI Agent 不正确使用工具的问题，特别是在任务完成时不调用 `completionResult` 工具，以及不正确使用 `askFollowupQuestion` 工具。本优化旨在通过改进系统提示词，使 AI Agent 更可靠地遵循工具使用规则。

## Glossary

- **Agent**: 基于 LLM 的智能代理，负责处理用户请求并调用工具
- **System Prompt**: 系统提示词，定义 Agent 的行为规则和工作模式
- **completionResult Tool**: 任务完成工具，用于标记任务结束并返回最终结论
- **askFollowupQuestion Tool**: 追问工具，用于向用户询问额外信息
- **Tool Call**: 工具调用，Agent 通过 XML 格式调用系统提供的工具
- **Compliance Rate**: 合规率，Agent 正确遵循规则的比例

## Requirements

### Requirement 1: 强制任务完成标记

**User Story:** 作为系统开发者，我希望 Agent 在完成任务时必须调用 completionResult 工具，以便系统能够正确识别任务状态并向用户提供明确的完成信号。

#### Acceptance Criteria

1. WHEN Agent 完成所有任务步骤，THE System Prompt SHALL 要求 Agent 必须调用 completionResult 工具
2. WHEN Agent 尝试直接向用户回复最终结论，THE System Prompt SHALL 明确禁止此行为并要求使用 completionResult 工具
3. THE System Prompt SHALL 在多个位置（目标、规则、工具指南）重复强调 completionResult 的强制性
4. THE System Prompt SHALL 提供清晰的正确和错误示例来说明 completionResult 的使用场景
5. THE System Prompt SHALL 将不调用 completionResult 列为最严重的违规行为

### Requirement 2: 明确追问工具使用场景

**User Story:** 作为系统开发者，我希望 Agent 只在真正需要额外信息时才使用 askFollowupQuestion 工具，以避免不必要的用户交互并提高任务执行效率。

#### Acceptance Criteria

1. THE System Prompt SHALL 明确定义何时应该使用 askFollowupQuestion 工具（缺少必要信息、需要用户决策）
2. THE System Prompt SHALL 明确定义何时不应该使用 askFollowupQuestion 工具（信息已足够、可以推断、常规确认）
3. WHEN Agent 考虑使用 askFollowupQuestion，THE System Prompt SHALL 要求 Agent 先评估是否真正需要
4. THE System Prompt SHALL 提供具体的使用和不使用场景示例
5. THE System Prompt SHALL 要求 askFollowupQuestion 必须包含具体的建议选项（2-4 个）

### Requirement 3: 工具调用决策流程

**User Story:** 作为系统开发者，我希望 Agent 在每个决策点都有清晰的工具选择逻辑，以确保在正确的时机调用正确的工具。

#### Acceptance Criteria

1. THE System Prompt SHALL 提供明确的决策树或流程图来指导工具选择
2. WHEN Agent 面临多个工具选择，THE System Prompt SHALL 提供优先级指导
3. THE System Prompt SHALL 要求 Agent 在调用工具前明确说明选择该工具的原因
4. WHEN 任务步骤全部完成，THE System Prompt SHALL 要求 Agent 立即调用 completionResult
5. THE System Prompt SHALL 禁止在任务完成后调用除 completionResult 之外的其他工具

### Requirement 4: 增强规则可见性和强制性

**User Story:** 作为系统开发者，我希望关键规则在提示词中更加突出和重复，以提高 Agent 的遵循率。

#### Acceptance Criteria

1. THE System Prompt SHALL 在文档开头使用醒目的格式（如大号标题、emoji）标记最关键的规则
2. THE System Prompt SHALL 在多个相关章节重复关键规则（completionResult、单次调用）
3. THE System Prompt SHALL 使用分层的严重性标记（🚫 硬性约束、⚠️ 重要原则、💡 最佳实践）
4. THE System Prompt SHALL 在每个工具的使用说明中重申相关的核心规则
5. THE System Prompt SHALL 在文档末尾提供快速检查清单（Checklist）

### Requirement 5: 提供反面案例和纠正指导

**User Story:** 作为系统开发者，我希望提示词包含常见错误的反面案例，以帮助 Agent 识别和避免这些错误。

#### Acceptance Criteria

1. THE System Prompt SHALL 为每个关键规则提供至少一个错误示例（标记为 ❌）
2. THE System Prompt SHALL 为每个错误示例提供对应的正确示例（标记为 ✅）
3. THE System Prompt SHALL 说明每个错误示例为什么是错误的
4. THE System Prompt SHALL 在工具使用指南中包含"常见错误"专门章节
5. THE System Prompt SHALL 提供真实场景下的完整对话示例（包含正确的工具调用序列）

### Requirement 6: 任务完成检测机制

**User Story:** 作为系统开发者，我希望 Agent 能够准确识别任务何时完成，以便在正确的时机调用 completionResult。

#### Acceptance Criteria

1. THE System Prompt SHALL 定义明确的任务完成标准（所有步骤完成、用户请求已满足、无待办事项）
2. THE System Prompt SHALL 要求 Agent 在每个步骤后评估任务是否完成
3. WHEN Agent 识别到任务完成，THE System Prompt SHALL 要求立即调用 completionResult
4. THE System Prompt SHALL 提供任务完成判断的决策树或检查清单
5. THE System Prompt SHALL 明确区分"步骤完成"和"任务完成"的概念

### Requirement 7: 工具调用格式验证指导

**User Story:** 作为系统开发者，我希望 Agent 在调用工具前能够自我验证格式正确性，以减少工具调用失败。

#### Acceptance Criteria

1. THE System Prompt SHALL 要求 Agent 在调用工具前进行格式自检
2. THE System Prompt SHALL 提供 XML 格式的详细规范和示例
3. THE System Prompt SHALL 列出常见的格式错误（缺少闭合标签、参数名错误、类型不匹配）
4. THE System Prompt SHALL 为每个工具提供完整的调用示例
5. THE System Prompt SHALL 强调工具名称和参数名称的大小写敏感性

### Requirement 8: 渐进式提示强化

**User Story:** 作为系统开发者，我希望在 Agent 执行过程中能够通过上下文提示来强化关键规则，特别是在关键决策点。

#### Acceptance Criteria

1. THE System Prompt SHALL 在工作流程的每个阶段重申相关规则
2. WHEN Agent 完成一个步骤，THE System Prompt SHALL 提醒检查是否需要调用 completionResult
3. WHEN Agent 考虑询问用户，THE System Prompt SHALL 提醒评估是否真正需要 askFollowupQuestion
4. THE System Prompt SHALL 在示例中展示完整的思考过程（包括规则检查）
5. THE System Prompt SHALL 使用"检查点"（Checkpoint）概念来标记关键决策时刻
