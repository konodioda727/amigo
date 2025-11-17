# Design Document: System Prompt 和工具提示词优化

## Overview

本设计文档描述了 Amigo AI Agent 系统的 System Prompt 和工具提示词的优化方案。通过重构提示词结构、增强约束表达、优化工具描述和改进示例质量，解决当前模型不遵循指令的三个核心问题：

1. **工具参数传递不准确** - 通过明确参数类型、提供格式示例和增强验证说明
2. **单轮对话调用多个工具** - 通过在多处强调单次调用限制并使用视觉标记
3. **任务完成后不使用 completionResult** - 通过在关键位置重复强调并禁止直接回复

## Architecture

### 提示词层次结构

```
System Prompt (系统提示词)
├── Objective (角色与目标)
│   ├── 角色定义
│   ├── 核心目标
│   └── 工作模式
├── Core Rules (核心规则)
│   ├── 🚫 硬性约束 (MUST/MUST NOT)
│   ├── ⚠️ 重要原则 (SHOULD/SHOULD NOT)
│   └── 💡 最佳实践 (MAY/RECOMMENDED)
├── Tool Use Guide (工具使用指南)
│   ├── 通用工具原则
│   ├── 单次调用限制 (重点强调)
│   ├── 参数格式规范
│   └── 完成标记要求 (重点强调)
└── Tool Definitions (工具定义)
    ├── 基础工具
    │   ├── completionResult (优先级最高)
    │   ├── askFollowupQuestion
    │   ├── assignTasks
    │   └── updateTodolist
    └── 用户自定义工具
```

### 优化策略分层

#### 第一层：结构优化
- 使用清晰的分隔符（`=====`）区分各个部分
- 关键规则前置，放在显著位置
- 使用视觉标记（emoji）增强注意力

#### 第二层：语言优化
- 使用强制性语言：**必须**、**严禁**、**禁止**
- 使用大写强调：**CRITICAL**、**IMPORTANT**、**WARNING**
- 使用重复强调：在多个位置重复关键约束

#### 第三层：示例优化
- 每个工具至少 2 个示例
- 覆盖正常场景和边界情况
- 提供正确和错误的对比示例

## Components and Interfaces

### 1. System Prompt 组件

#### 1.1 Main Agent Objective (`main/objective.md`)

**优化要点：**
- 明确"单次工具调用"作为核心工作模式
- 在角色定义中强调"必须使用 completionResult 结束任务"
- 简化"规划先行"的描述，避免过度强调导致忽略其他规则

**关键改进：**
```markdown
### 核心工作模式

1. **🎯 规划先行**：在调用工具前，先说明你的思考路径
2. **🔧 单次调用**：每轮对话只能调用一个工具，等待结果后再继续
3. **✅ 明确完成**：任务完成后必须调用 completionResult 工具
```

#### 1.2 Main Agent Rules (`main/rules.md`)

**优化要点：**
- 将"单次工具调用限制"提升为第一条规则
- 增加"禁止行为"清单
- 明确工具调用的生命周期

**关键改进：**
```markdown
## 🚫 硬性约束（违反将导致执行失败）

1. **单次工具调用限制**
   - 每轮对话最多只能调用一个工具
   - 禁止在同一个响应中使用多个工具标签
   - 必须等待工具结果返回后再决定下一步

2. **任务完成标记**
   - 任务完成后必须调用 completionResult 工具
   - 严禁直接向用户提供最终结论而不调用 completionResult
   - 即使是简单任务也必须使用 completionResult 结束
```

#### 1.3 Sub Agent Objective (`sub/objective.md`)

**优化要点：**
- 保持与主 Agent 一致的约束
- 强调"专注执行，不做额外规划"
- 明确子 Agent 也必须使用 completionResult

#### 1.4 Sub Agent Rules (`sub/rules.md`)

**优化要点：**
- 继承主 Agent 的硬性约束
- 简化规则，避免冗余
- 强调"无冗余对话"

#### 1.5 Tool Use Guide (`tooluseGuide.md`)

**优化要点：**
- 重构为三个部分：通用原则、关键约束、参数规范
- 在多处重复"单次调用"和"completionResult"要求
- 增加参数格式示例

**新增结构：**
```markdown
## 🚫 关键约束（必须严格遵守）

### 约束 1：单次工具调用限制
**每轮对话只能调用一个工具。**

❌ 错误示例：
<askFollowupQuestion>...</askFollowupQuestion>
<updateTodolist>...</updateTodolist>

✅ 正确示例：
<askFollowupQuestion>...</askFollowupQuestion>
（等待结果后，在下一轮再调用其他工具）

### 约束 2：任务完成必须调用 completionResult
**任何任务完成后，必须调用 completionResult 工具。**

❌ 错误：直接回复"任务已完成，结果是..."
✅ 正确：<completionResult>任务已完成，结果是...</completionResult>
```

### 2. 工具提示词组件

#### 2.1 completionResult 工具

**优化要点：**
- 提升为最重要的工具，在工具列表中排第一
- 在 description 和 whenToUse 中多次强调必要性
- 增加"不使用的后果"说明

**关键改进：**
```typescript
description: "🎯 【必须使用】在任务完成后，使用此工具标记任务结束并返回最终结论。这是结束任务的唯一正确方式。",

whenToUse:
  "**关键规则：任何任务完成后，你必须使用此工具来结束任务。**\n\n" +
  "适用场景：\n" +
  "1. 所有待办事项都已完成\n" +
  "2. 用户的请求已经得到完整回答\n" +
  "3. 简单任务执行完毕\n\n" +
  "**严禁行为：**\n" +
  "- ❌ 直接向用户回复最终结论而不调用此工具\n" +
  "- ❌ 使用普通文本形式说'任务完成'\n" +
  "- ❌ 在任务未完成时调用此工具\n\n" +
  "**不使用此工具的后果：**\n" +
  "- 系统无法识别任务已完成\n" +
  "- 用户无法获得明确的完成信号\n" +
  "- 任务状态将保持为'进行中'"
```

#### 2.2 assignTasks 工具

**优化要点：**
- 动态注入可用工具列表（已实现，需增强说明）
- 增加"工具名称验证"的强调
- 提供"无可用工具"的示例
- 明确说明工具名称必须完全匹配

**关键改进：**
```typescript
whenToUse:
  "当请求中存在可并行执行的步骤时，应使用此工具进行分配。\n\n" +
  "**🚫 关键约束：工具名称验证**\n" +
  "1. **只能使用下方列出的工具名称**，不要编造或假设工具存在\n" +
  "2. 工具名称必须**完全匹配**（区分大小写）\n" +
  "3. 如果不确定有哪些工具可用，请将 `<tools><tool></tool></tools>` 留空\n" +
  "4. 使用不存在的工具会导致任务执行失败\n\n" +
  "**当前可用的工具名称列表：**\n" +
  "{TOOL_LIST_WILL_BE_INJECTED}\n\n" +
  "**拆分原则：**\n" +
  "1. 确保每个 task 都有明确、可独立完成的 target\n" +
  "2. 为每个 task 编写清晰的 subAgentPrompt\n" +
  "3. 只分配列表中存在的工具"
```

#### 2.3 askFollowupQuestion 工具

**优化要点：**
- 明确"何时不应使用"
- 增加参数格式示例
- 说明 suggestOptions 的最佳实践

**关键改进：**
```typescript
whenToUse:
  "当你需要更多信息才能完成任务时，可以使用此工具向用户提出后续问题。\n\n" +
  "**适用场景：**\n" +
  "- 用户请求不明确或有歧义\n" +
  "- 需要用户选择具体方案\n" +
  "- 缺少必要的参数或信息\n\n" +
  "**不应使用的场景：**\n" +
  "- ❌ 你已经有足够信息完成任务\n" +
  "- ❌ 可以通过工具获取的信息（应使用相应工具）\n" +
  "- ❌ 任务已经完成（应使用 completionResult）\n\n" +
  "**最佳实践：**\n" +
  "- 提供 2-5 个具体的 suggestOptions\n" +
  "- 选项应该是可操作的、互斥的\n" +
  "- 问题应该清晰、具体"
```

#### 2.4 updateTodolist 工具

**优化要点：**
- 明确这是"内部规划工具"，不是用户界面
- 增加 Markdown 格式示例
- 说明如何标记完成状态

### 3. 工具提示词生成器 (`systemPrompt/tools.ts`)

**优化要点：**
- 在 generateToolsPrompt 中为 completionResult 添加特殊标记
- 改进参数类型的描述方式
- 增加参数格式示例的生成

**关键改进：**
```typescript
export function generateToolsPrompt(
  tools: Array<ToolInterface<any>>,
  allToolNames?: string[]
): string {
  // 将 completionResult 排在最前面
  const sortedTools = [...tools].sort((a, b) => {
    if (a.name === 'completionResult') return -1;
    if (b.name === 'completionResult') return 1;
    return 0;
  });

  return sortedTools.map((tool) => {
    // 为 completionResult 添加特殊标记
    const priority = tool.name === 'completionResult' 
      ? '🎯 【优先级最高 - 任务完成必用】' 
      : '';
    
    // ... 其他逻辑
  }).join("\n\n");
}
```

## Data Models

### Prompt Template Structure

```typescript
interface PromptSection {
  title: string;
  priority: 'critical' | 'important' | 'normal';
  content: string;
  visualMarker?: '🚫' | '⚠️' | '💡' | '🎯';
}

interface ToolPrompt {
  name: string;
  priority: number; // completionResult = 1, others = 2+
  description: string;
  whenToUse: string;
  whenNotToUse?: string; // 新增
  params: ToolParam[];
  examples: ToolExample[];
  commonMistakes?: string[]; // 新增
}

interface ToolExample {
  scenario: string;
  code: string;
  explanation?: string;
  isCorrect: boolean; // 用于标记正确/错误示例
}
```

## Error Handling

### 1. 参数验证错误

**问题：** 模型传递了错误类型或缺失必填参数

**解决方案：**
- 在工具描述中明确列出所有必填参数
- 提供参数格式示例
- 在 params 描述中说明验证规则

### 2. 多工具调用错误

**问题：** 模型在单轮中调用多个工具

**解决方案：**
- 在 3 个位置重复强调单次调用限制：
  1. Core Rules 第一条
  2. Tool Use Guide 关键约束
  3. 每个工具的 whenToUse 中提醒
- 提供错误示例和正确示例的对比

### 3. 缺失 completionResult 错误

**问题：** 任务完成后模型直接回复而不调用工具

**解决方案：**
- 将 completionResult 排在工具列表第一位
- 在 5 个位置强调必要性：
  1. Objective 核心工作模式
  2. Core Rules 硬性约束
  3. Tool Use Guide 关键约束
  4. completionResult 工具描述
  5. 其他工具的 whenToUse 中交叉引用
- 明确说明"不使用的后果"

### 4. 工具名称错误

**问题：** assignTasks 中使用了不存在的工具名称

**解决方案：**
- 动态注入当前可用工具列表（已实现）
- 在注入的列表前后增加警告文本
- 提供"无可用工具"的示例
- 在工具执行时记录警告日志（已实现）

## Testing Strategy

### 1. 单元测试

**测试目标：** 验证提示词生成逻辑

```typescript
describe('generateToolsPrompt', () => {
  it('should place completionResult first', () => {
    const tools = [askFollowupQuestion, completionResult, assignTasks];
    const prompt = generateToolsPrompt(tools);
    expect(prompt).toMatch(/^.*completionResult.*askFollowupQuestion/s);
  });

  it('should inject available tool names for assignTasks', () => {
    const tools = [assignTasks];
    const allToolNames = ['tool1', 'tool2'];
    const prompt = generateToolsPrompt(tools, allToolNames);
    expect(prompt).toContain('tool1');
    expect(prompt).toContain('tool2');
  });
});
```

### 2. 集成测试

**测试目标：** 验证模型行为

```typescript
describe('Model Behavior', () => {
  it('should call only one tool per turn', async () => {
    const response = await agent.chat('复杂任务');
    const toolCalls = extractToolCalls(response);
    expect(toolCalls.length).toBeLessThanOrEqual(1);
  });

  it('should call completionResult when task is done', async () => {
    const response = await agent.chat('简单任务');
    expect(response).toContain('<completionResult>');
  });

  it('should use valid tool names in assignTasks', async () => {
    const response = await agent.chat('分配任务');
    const assignedTools = extractAssignedTools(response);
    const validTools = toolService.toolNames;
    assignedTools.forEach(tool => {
      expect(validTools).toContain(tool);
    });
  });
});
```

### 3. 人工评估测试

**测试场景：**

| 场景 | 预期行为 | 验证指标 |
|------|---------|---------|
| 简单问答 | 直接回答 + completionResult | 是否调用 completionResult |
| 复杂任务 | 分解 → 执行 → completionResult | 每轮只调用一个工具 |
| 需要信息 | askFollowupQuestion | 提供了 suggestOptions |
| 并行任务 | assignTasks + 正确工具名 | 工具名在可用列表中 |
| 任务完成 | completionResult | 不直接回复最终结论 |

### 4. A/B 测试

**对比维度：**
- 优化前 vs 优化后的指令遵循率
- 不同强调程度的效果（单次提及 vs 多次重复）
- 不同视觉标记的效果（emoji vs 纯文本）

## Implementation Phases

### Phase 1: 核心约束强化（高优先级）
- 重写 Tool Use Guide，增加"关键约束"部分
- 优化 completionResult 工具描述
- 在 Core Rules 中前置"单次调用"和"completionResult"规则

### Phase 2: 工具描述优化（高优先级）
- 为每个工具增加"何时不使用"说明
- 改进 assignTasks 的工具名称验证说明
- 增加参数格式示例

### Phase 3: 示例质量提升（中优先级）
- 为每个工具添加第二个示例
- 增加错误示例和正确示例的对比
- 在示例中添加注释说明

### Phase 4: 结构优化（中优先级）
- 统一使用视觉标记（emoji）
- 调整工具排序（completionResult 第一）
- 优化分隔符和标题层级

### Phase 5: 测试和迭代（持续）
- 实施集成测试
- 收集模型行为数据
- 根据数据调整提示词

## Design Decisions and Rationales

### 决策 1：多次重复关键约束

**理由：** 
- LLM 对提示词中多次出现的内容更敏感
- 在不同上下文中重复可以覆盖不同的决策路径
- 研究表明重复 3-5 次可以显著提高遵循率

### 决策 2：使用视觉标记（emoji）

**理由：**
- 增强视觉注意力，使关键信息更突出
- 帮助模型区分不同优先级的规则
- 在长文本中提供视觉锚点

### 决策 3：提供错误示例

**理由：**
- 明确告诉模型"什么不该做"
- 对比学习比单纯的正面示例更有效
- 减少模型的"创造性误用"

### 决策 4：completionResult 优先排序

**理由：**
- 工具列表中的位置影响模型的选择倾向
- 第一个工具更容易被"记住"
- 强化"任务完成"的重要性

### 决策 5：动态注入工具列表

**理由：**
- 避免模型使用不存在的工具
- 提供明确的"可用工具清单"
- 减少幻觉（hallucination）

### 决策 6：保持主/子 Agent 约束一致

**理由：**
- 避免子 Agent 违反约束导致整体失败
- 简化系统行为，提高可预测性
- 降低维护成本

## Metrics and Success Criteria

### 关键指标

1. **工具参数准确率**
   - 目标：> 95%
   - 测量：正确参数调用次数 / 总调用次数

2. **单次调用遵循率**
   - 目标：> 98%
   - 测量：单工具调用次数 / 总响应次数

3. **completionResult 使用率**
   - 目标：> 90%
   - 测量：任务完成时调用 completionResult 次数 / 任务完成总次数

4. **工具名称准确率**
   - 目标：> 99%
   - 测量：有效工具名次数 / assignTasks 中总工具名次数

### 成功标准

- 所有关键指标达到目标值
- 用户反馈的"模型不遵循指令"问题减少 80%
- 系统错误日志中的工具调用错误减少 70%
