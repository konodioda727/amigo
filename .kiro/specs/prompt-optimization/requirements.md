# Requirements Document

## Introduction

本文档定义了 Amigo AI Agent 系统的 System Prompt 和工具提示词优化需求。当前系统存在模型不遵循指令的问题，主要表现为：工具参数传递不准确、单轮对话调用多个工具、任务完成后未调用 completionResult 工具。本优化旨在通过改进提示词结构、增强约束表达和优化工具描述来提高模型的指令遵循度。

## Glossary

- **System Prompt**: 系统提示词，定义 Agent 的角色、目标和行为规则
- **Tool Prompt**: 工具提示词，描述工具的功能、使用场景和参数规范
- **Main Agent**: 主 Agent，负责任务规划和协调
- **Sub Agent**: 子 Agent，负责执行具体的子任务
- **LLM**: Large Language Model，大语言模型
- **XML Format**: 工具调用使用的 XML 格式标签
- **Tool Parameter**: 工具参数，传递给工具的输入数据
- **Completion Result**: 任务完成工具，用于标记任务结束并返回最终结论

## Requirements

### Requirement 1: 工具参数准确性

**User Story:** 作为系统开发者，我希望模型能够准确传递工具参数，以便工具能够正确执行并返回预期结果。

#### Acceptance Criteria

1. WHEN 模型调用任何工具时，THE System SHALL 确保所有必填参数都被正确提供
2. WHEN 模型构造工具参数时，THE System SHALL 确保参数类型与工具定义完全匹配
3. WHEN 工具定义包含嵌套结构时，THE System SHALL 确保模型理解并正确构造嵌套的 XML 结构
4. WHEN 工具参数包含数组类型时，THE System SHALL 确保模型使用正确的 XML 数组格式
5. WHERE 工具参数为可选时，THE System SHALL 允许模型省略该参数或提供空值

### Requirement 2: 单次工具调用约束

**User Story:** 作为系统架构师，我希望模型在每轮对话中只调用一个工具，以便系统能够顺序处理工具调用并保持状态一致性。

#### Acceptance Criteria

1. WHEN 模型生成响应时，THE System SHALL 限制每轮对话最多调用一个工具
2. WHEN 模型需要执行多个操作时，THE System SHALL 引导模型先调用一个工具，等待结果后再决定下一步
3. IF 模型尝试在单轮中调用多个工具，THEN THE System SHALL 通过提示词明确禁止此行为
4. WHEN 工具执行完成后，THE System SHALL 要求模型基于工具结果进行下一步决策
5. THE System SHALL 在提示词中使用强调标记（如加粗、大写）突出单次调用限制

### Requirement 3: 任务完成标记

**User Story:** 作为产品经理，我希望模型在完成任务后必须调用 completionResult 工具，以便系统能够正确标记任务状态并向用户提供明确的完成信号。

#### Acceptance Criteria

1. WHEN 所有任务步骤完成时，THE System SHALL 要求模型调用 completionResult 工具
2. WHEN 模型准备给出最终结论时，THE System SHALL 禁止模型直接回复用户，必须通过 completionResult 工具
3. THE System SHALL 在多个位置重复强调 completionResult 的必要性
4. WHEN 简单任务完成时，THE System SHALL 同样要求调用 completionResult 工具
5. THE System SHALL 明确说明不调用 completionResult 的后果（如任务状态不明确）

### Requirement 4: 提示词结构优化

**User Story:** 作为 AI 工程师，我希望提示词具有清晰的层次结构和一致的格式，以便模型能够更好地理解和遵循指令。

#### Acceptance Criteria

1. THE System SHALL 使用统一的标题层级和分隔符组织提示词内容
2. THE System SHALL 将关键规则放在提示词的显著位置
3. THE System SHALL 使用编号列表明确规则的优先级
4. THE System SHALL 为每个工具提供至少一个完整的使用示例
5. THE System SHALL 在工具描述中明确说明"何时使用"和"何时不使用"

### Requirement 5: 工具约束增强

**User Story:** 作为系统开发者，我希望工具提示词能够明确约束模型的行为，以便减少工具误用和参数错误。

#### Acceptance Criteria

1. WHEN 工具有特定使用限制时，THE System SHALL 在 whenToUse 字段中明确列出
2. WHEN 工具参数有格式要求时，THE System SHALL 在参数描述中提供格式示例
3. THE System SHALL 为 assignTasks 工具动态注入当前可用的工具名称列表
4. THE System SHALL 明确禁止模型使用不存在的工具名称
5. WHERE 工具调用可能失败时，THE System SHALL 在描述中说明失败场景和处理方式

### Requirement 6: 示例质量提升

**User Story:** 作为 AI 训练师，我希望工具示例能够覆盖常见场景和边界情况，以便模型能够通过示例学习正确的使用模式。

#### Acceptance Criteria

1. THE System SHALL 为每个工具提供至少 2 个不同场景的示例
2. WHEN 工具支持可选参数时，THE System SHALL 提供包含和不包含可选参数的示例
3. THE System SHALL 在示例中展示正确的 XML 格式和缩进
4. THE System SHALL 为复杂工具（如 assignTasks）提供有工具和无工具两种场景的示例
5. THE System SHALL 在示例中注释关键部分以帮助模型理解

### Requirement 7: 错误预防机制

**User Story:** 作为质量保证工程师，我希望提示词能够预防常见错误，以便减少模型的错误率和系统的调试成本。

#### Acceptance Criteria

1. THE System SHALL 在提示词中明确列出常见错误模式
2. THE System SHALL 使用"禁止"、"严禁"、"必须"等强制性语言表达硬性约束
3. THE System SHALL 在关键规则前使用视觉标记（如 ⚠️、🚫）增强注意力
4. THE System SHALL 提供反例说明不正确的使用方式
5. THE System SHALL 在工具描述中说明参数验证规则

### Requirement 8: 上下文一致性

**User Story:** 作为系统架构师，我希望主 Agent 和子 Agent 的提示词保持一致的风格和约束，以便整个系统行为可预测。

#### Acceptance Criteria

1. THE System SHALL 在主 Agent 和子 Agent 提示词中使用相同的工具使用原则
2. THE System SHALL 确保两种 Agent 都遵循单次工具调用限制
3. THE System SHALL 确保两种 Agent 都必须调用 completionResult 结束任务
4. WHERE 主 Agent 和子 Agent 有不同职责时，THE System SHALL 在各自的 objective 中明确说明差异
5. THE System SHALL 保持工具描述在两种 Agent 中的一致性
