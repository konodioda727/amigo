# Design Document: System Prompt 和工具提示词优化

## Overview

本设计文档描述了 Amigo AI Agent 系统的 System Prompt 和工具提示词的优化方案。通过重构提示词结构、增强约束表达、优化工具描述和改进示例质量，解决当前模型不遵循指令的核心问题：

1. **任务完成后不调用 completionResult** - 通过强制性语言、多位置重复、决策流程指导
2. **不正确使用 askFollowupQuestion** - 通过明确使用/不使用场景、提供决策检查清单
3. **工具参数传递不准确** - 通过明确参数类型、提供格式示例和增强验证说明
4. **单轮对话调用多个工具** - 通过在多处强调单次调用限制并使用视觉标记

本次优化基于 8 个核心需求（详见 requirements.md），采用渐进式强化策略，在提示词的多个关键位置重复和强化规则。

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
- 在文档开头使用醒目的"🚨 关键规则"部分，立即强调 completionResult 的强制性
- 明确"单次工具调用"作为核心工作模式
- 在工作流程中的每个步骤都嵌入规则检查点
- 简化"规划先行"的描述，避免过度强调导致忽略其他规则

**关键改进：**
```markdown
# 🚨 关键规则（必须遵守）

在开始工作前，请牢记以下两条最重要的规则：

1. **任务完成必须调用 completionResult** - 这是结束任务的唯一正确方式
2. **每轮只调用一个工具** - 等待工具结果返回后再继续

---

### 核心工作模式

1. **🎯 规划先行**：在调用工具前，先说明你的思考路径
2. **🔧 单次调用**：每轮对话只能调用一个工具，等待结果后再继续
3. **✅ 明确完成**：任务完成后必须调用 completionResult 工具

### 工作流程（带检查点）

1. **理解任务**：分析用户请求，确定需要执行的步骤
2. **展示计划**：向用户简要说明您的思考路径
3. **执行工具**：调用一个工具来完成当前步骤
4. **等待结果**：工具执行完成后，根据结果决定下一步
5. **🔍 检查点**：评估任务是否完成
   - ✅ 如果完成 → 立即调用 completionResult
   - ⏭️ 如果未完成 → 返回步骤 2
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
- 在使用前增加"自我检查清单"
- 明确"何时不应使用"并提供具体场景
- 增加参数格式示例
- 说明 suggestOptions 的最佳实践
- 强调与 completionResult 的互斥关系

**关键改进：**
```typescript
whenToUse:
  "⚠️ **使用前自我检查：**\n" +
  "在调用此工具前，请先问自己：\n" +
  "1. 我是否真的缺少必要信息？\n" +
  "2. 这个信息能否通过其他工具获取？\n" +
  "3. 任务是否已经完成？（如果是，应调用 completionResult）\n\n" +
  "**✅ 应该使用的场景：**\n" +
  "- 用户请求不明确或有歧义（例如："优化代码"但未说明优化什么）\n" +
  "- 需要用户在多个方案中做选择（例如：使用 REST 还是 GraphQL）\n" +
  "- 缺少必要的参数或配置信息（例如：API 密钥、数据库连接信息）\n" +
  "- 需要确认可能有风险的操作（例如：删除数据、修改配置）\n\n" +
  "**❌ 不应使用的场景：**\n" +
  "- 你已经有足够信息完成任务\n" +
  "- 可以通过 readFile、listDirectory 等工具获取的信息\n" +
  "- 任务已经完成（此时必须使用 completionResult）\n" +
  "- 只是想确认"是否继续"（如果任务明确，直接执行）\n" +
  "- 询问用户对结果是否满意（应在 completionResult 中说明）\n\n" +
  "**参数要求：**\n" +
  "- question: 必须清晰、具体，避免开放式问题\n" +
  "- suggestOptions: 必须提供 2-4 个具体、可操作的选项\n" +
  "- 选项应该是互斥的、完整的（覆盖主要情况）\n\n" +
  "**示例：**\n" +
  "✅ 好的问题：\"您希望使用哪种数据库？\" + [\"PostgreSQL\", \"MySQL\", \"MongoDB\"]\n" +
  "❌ 不好的问题：\"您还需要什么？\" + [\"是\", \"否\"]"
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
  visualMarker?: '🚫' | '⚠️' | '💡' | '🎯' | '🚨';
  checkpoints?: string[]; // 检查点提示
}

interface ToolPrompt {
  name: string;
  priority: number; // completionResult = 1, others = 2+
  description: string;
  whenToUse: string;
  whenNotToUse?: string; // 何时不应使用
  selfCheckList?: string[]; // 使用前自我检查清单
  params: ToolParam[];
  examples: ToolExample[];
  commonMistakes?: string[]; // 常见错误
  relatedRules?: string[]; // 相关核心规则引用
}

interface ToolExample {
  scenario: string;
  code: string;
  explanation?: string;
  isCorrect: boolean; // 用于标记正确/错误示例
  violatedRule?: string; // 如果是错误示例，说明违反了哪条规则
}

interface DecisionFlowNode {
  question: string;
  yesAction: string | DecisionFlowNode;
  noAction: string | DecisionFlowNode;
}

// 任务完成检测决策树
const taskCompletionDecisionTree: DecisionFlowNode = {
  question: "所有计划的步骤都已执行完毕？",
  yesAction: {
    question: "用户的请求已经得到完整回答？",
    yesAction: "✅ 立即调用 completionResult",
    noAction: "继续执行剩余步骤"
  },
  noAction: "继续执行剩余步骤"
};
```

## Error Handling

### 1. 缺失 completionResult 错误（最高优先级）

**问题：** 任务完成后模型直接回复而不调用工具

**根本原因分析：**
- 模型可能认为"说明任务完成"就足够了
- 在长对话中可能忘记这个要求
- 可能被"规划先行"等其他指令分散注意力

**多层次解决方案：**

1. **结构层面**：
   - 在文档最开头（Objective 第一段）用 🚨 标记强调
   - 将 completionResult 排在工具列表第一位
   - 在工作流程中增加"检查点"步骤

2. **语言层面**：
   - 使用强制性语言："必须"、"唯一正确方式"
   - 在 7 个位置重复强调：
     1. Objective 开头的关键规则
     2. Objective 核心工作模式
     3. Objective 工作流程检查点
     4. Core Rules 硬性约束第一条
     5. Tool Use Guide 关键约束
     6. completionResult 工具描述
     7. 其他工具的 whenNotToUse 中交叉引用

3. **示例层面**：
   - 提供 3 个错误示例（直接回复、说"任务完成"、使用其他工具）
   - 提供 3 个正确示例（简单任务、复杂任务、信息查询）
   - 在每个示例中标注"为什么"

4. **决策支持**：
   - 提供任务完成检测决策树
   - 在工作流程中嵌入检查点
   - 明确说明"不使用的后果"

### 2. 不正确使用 askFollowupQuestion 错误（高优先级）

**问题：** 模型在不需要时也使用 askFollowupQuestion，或者使用方式不当

**根本原因分析：**
- 模型可能过度谨慎，想要"确认"每个步骤
- 不清楚何时信息已经足够
- 将 askFollowupQuestion 当作"礼貌性确认"

**解决方案：**

1. **使用前检查清单**：
   - 在 whenToUse 开头提供 3 个自我检查问题
   - 要求模型在调用前明确回答这些问题

2. **明确场景划分**：
   - 提供 4 个"应该使用"的具体场景（带示例）
   - 提供 5 个"不应使用"的具体场景（带示例）
   - 使用 ✅ 和 ❌ 标记增强对比

3. **参数质量要求**：
   - 强制要求提供 suggestOptions（2-4 个）
   - 说明好的选项和不好的选项的区别
   - 提供正反面示例

4. **与 completionResult 的互斥关系**：
   - 明确说明：任务完成后不应使用 askFollowupQuestion
   - 在 completionResult 的 whenToUse 中也提到这一点

### 3. 多工具调用错误（高优先级）

**问题：** 模型在单轮中调用多个工具

**解决方案：**
- 在 3 个位置重复强调单次调用限制：
  1. Objective 关键规则
  2. Core Rules 硬性约束第一条
  3. Tool Use Guide 关键约束
- 提供错误示例和正确示例的对比
- 在示例中明确说明"等待结果后再继续"

### 4. 参数验证错误（中优先级）

**问题：** 模型传递了错误类型或缺失必填参数

**解决方案：**
- 在工具描述中明确列出所有必填参数
- 提供参数格式示例（特别是嵌套对象和数组）
- 在 params 描述中说明验证规则
- 增加 XML 格式自检指导

### 5. 工具名称错误（中优先级）

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

## Decision Support Mechanisms

### 1. 任务完成检测决策树

在 Objective 和 Tool Use Guide 中嵌入以下决策树：

```
开始评估 → 所有计划步骤都已完成？
           ├─ 否 → 继续执行下一步
           └─ 是 → 用户请求已得到完整回答？
                   ├─ 否 → 继续执行剩余步骤
                   └─ 是 → ✅ 立即调用 completionResult
```

### 2. askFollowupQuestion 使用决策清单

在工具描述中提供以下检查清单：

```
使用前自我检查：
□ 我是否真的缺少必要信息？
□ 这个信息能否通过其他工具获取？
□ 任务是否已经完成？（如果是 → completionResult）
□ 我能否提供 2-4 个具体的建议选项？

如果前 3 项都是"否"，且第 4 项是"是" → 可以使用
否则 → 不应使用
```

### 3. 工具选择优先级指导

在 Tool Use Guide 中提供工具选择优先级：

```
1. 任务完成？ → completionResult（最高优先级）
2. 需要并行执行？ → assignTasks
3. 缺少必要信息？ → askFollowupQuestion
4. 需要规划步骤？ → updateTodolist
5. 其他操作 → 使用相应的功能工具
```

### 4. 检查点（Checkpoint）机制

在工作流程的关键位置嵌入检查点：

- **Checkpoint 1**（执行工具前）：这是正确的工具吗？
- **Checkpoint 2**（工具执行后）：任务是否完成？
- **Checkpoint 3**（准备回复前）：我是否需要调用 completionResult？

## Prompt Reinforcement Strategy

### 渐进式强化位置

| 位置 | completionResult 强调 | askFollowupQuestion 指导 | 单次调用限制 |
|------|---------------------|----------------------|------------|
| Objective 开头 | 🚨 关键规则 | - | 🚨 关键规则 |
| Objective 工作模式 | ✅ 明确完成 | - | 🔧 单次调用 |
| Objective 工作流程 | 🔍 检查点 | - | - |
| Core Rules 第一条 | 硬性约束 | - | 硬性约束 |
| Core Rules 第三条 | - | 信息收集原则 | - |
| Tool Use Guide 约束 1 | - | - | 详细说明 + 示例 |
| Tool Use Guide 约束 2 | 详细说明 + 示例 | - | - |
| completionResult 工具 | 完整描述 | 互斥关系 | - |
| askFollowupQuestion 工具 | 互斥关系 | 完整描述 + 检查清单 | - |
| 其他工具 whenNotToUse | 交叉引用 | - | - |

### 语言强度分级

- **Level 1（最强）**：必须、严禁、唯一正确方式、🚨 标记
- **Level 2（强）**：应当、不应、⚠️ 标记
- **Level 3（建议）**：建议、可以、💡 标记

关键规则（completionResult、单次调用）使用 Level 1 语言。

## Implementation Phases

### Phase 1: 核心约束强化（高优先级）
**目标**：解决 completionResult 缺失问题

**任务**：
- 在 `main/objective.md` 开头添加 🚨 关键规则部分
- 在工作流程中添加检查点机制
- 重写 Tool Use Guide，增加"关键约束"部分
- 优化 completionResult 工具描述，增加 7 处强调
- 在 Core Rules 中将 completionResult 提升为第一条硬性约束

**验证**：completionResult 使用率 > 90%

### Phase 2: askFollowupQuestion 优化（高优先级）
**目标**：减少不必要的用户交互

**任务**：
- 在 askFollowupQuestion 工具描述中添加自我检查清单
- 提供 4 个"应该使用"和 5 个"不应使用"的具体场景
- 增加与 completionResult 的互斥关系说明
- 在 Core Rules 中添加"信息收集"原则

**验证**：不必要的 askFollowupQuestion 调用减少 60%

### Phase 3: 决策支持机制（高优先级）
**目标**：帮助模型在关键时刻做出正确决策

**任务**：
- 在 Objective 中嵌入任务完成检测决策树
- 在 Tool Use Guide 中添加工具选择优先级指导
- 为 askFollowupQuestion 添加使用决策清单
- 在工作流程中添加 3 个检查点

**验证**：工具选择准确率 > 95%

### Phase 4: 工具描述优化（中优先级）
**目标**：提高工具调用的准确性

**任务**：
- 为每个工具增加"何时不使用"说明
- 改进 assignTasks 的工具名称验证说明
- 增加参数格式示例（特别是 XML 嵌套结构）
- 在 tools.ts 中实现 completionResult 优先排序

**验证**：参数验证错误减少 70%

### Phase 5: 示例质量提升（中优先级）
**目标**：通过示例强化正确行为

**任务**：
- 为 completionResult 添加 3 个错误示例和 3 个正确示例
- 为 askFollowupQuestion 添加正反面对比示例
- 在每个示例中添加"为什么"的解释
- 提供完整的对话流程示例

**验证**：示例覆盖率 100%

### Phase 6: 结构和视觉优化（低优先级）
**目标**：提高提示词的可读性和注意力引导

**任务**：
- 统一使用视觉标记（🚨 🚫 ⚠️ 💡 🎯 ✅ ❌）
- 优化分隔符和标题层级
- 调整文档结构，关键内容前置

**验证**：视觉一致性检查通过

### Phase 7: 测试和迭代（持续）
**目标**：验证优化效果并持续改进

**任务**：
- 实施集成测试（5 个测试场景）
- 收集模型行为数据（关键指标）
- 进行 A/B 测试（优化前后对比）
- 根据数据调整提示词

**验证**：所有关键指标达到目标值

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

## Appendix: Complete Example Scenarios

### 场景 1：简单信息查询（正确使用 completionResult）

```
用户：今天天气怎么样？

Agent 思考：这是一个简单的信息查询任务。
1. 我需要调用 getWeather 工具
2. 获取结果后，任务就完成了
3. 必须使用 completionResult 结束

Agent 回复：让我查询一下天气信息。

<getWeather>
  <location>当前位置</location>
</getWeather>

[工具返回：晴天，25°C]

Agent 回复：
<completionResult>
  <content>今天天气晴朗，温度 25°C，适合外出活动。</content>
</completionResult>
```

### 场景 2：需要用户选择（正确使用 askFollowupQuestion）

```
用户：帮我优化代码

Agent 思考：
- 用户请求不明确（优化什么？性能？可读性？）
- 我缺少必要信息
- 任务未完成
- ✅ 应该使用 askFollowupQuestion

Agent 回复：
<askFollowupQuestion>
  <question>您希望优化代码的哪个方面？</question>
  <suggestOptions>
    <option>性能优化（减少执行时间）</option>
    <option>可读性优化（改进代码结构）</option>
    <option>内存优化（减少内存占用）</option>
  </suggestOptions>
</askFollowupQuestion>

[用户选择：性能优化]

Agent 回复：好的，让我分析代码性能瓶颈。

<readFile>
  <path>src/main.ts</path>
</readFile>

[分析并优化...]

Agent 回复：
<completionResult>
  <content>已完成性能优化，主要改进：1. 使用缓存减少重复计算 2. 优化循环逻辑。预计性能提升 40%。</content>
</completionResult>
```

### 场景 3：错误示例 - 任务完成后不调用 completionResult

```
用户：创建一个 README 文件

Agent 回复：好的，让我创建 README 文件。

<writeFile>
  <path>README.md</path>
  <content># 项目标题...</content>
</writeFile>

[工具执行成功]

❌ 错误的做法：
Agent 回复：README 文件已创建完成！

✅ 正确的做法：
Agent 回复：
<completionResult>
  <content>README 文件已创建完成，包含了项目标题、描述和使用说明。</content>
</completionResult>
```

### 场景 4：错误示例 - 不必要的 askFollowupQuestion

```
用户：读取 config.json 文件的内容

❌ 错误的做法：
Agent 回复：
<askFollowupQuestion>
  <question>您确定要读取 config.json 文件吗？</question>
  <suggestOptions>
    <option>是的，读取</option>
    <option>不，取消</option>
  </suggestOptions>
</askFollowupQuestion>

✅ 正确的做法：
Agent 回复：让我读取 config.json 文件。

<readFile>
  <path>config.json</path>
</readFile>

[读取成功]

<completionResult>
  <content>config.json 的内容如下：[内容]</content>
</completionResult>
```

### 场景 5：错误示例 - 单轮调用多个工具

```
用户：创建项目结构并初始化 Git

❌ 错误的做法：
Agent 回复：我会创建项目结构并初始化 Git。

<createDirectory>
  <path>src</path>
</createDirectory>

<executeCommand>
  <command>git init</command>
</executeCommand>

✅ 正确的做法：
Agent 回复：让我先创建项目结构。

<createDirectory>
  <path>src</path>
</createDirectory>

[等待结果]

Agent 回复：项目结构已创建，现在初始化 Git。

<executeCommand>
  <command>git init</command>
</executeCommand>

[等待结果]

Agent 回复：
<completionResult>
  <content>项目结构已创建，Git 仓库已初始化。</content>
</completionResult>
```

## Summary

本设计文档提供了全面的提示词优化方案，重点解决 AI Agent 不正确使用工具的问题。通过多层次、多位置的强化策略，结合决策支持机制和丰富的示例，预期能够显著提高模型的指令遵循率。

关键创新点：
1. **渐进式强化**：在 7 个位置重复关键规则
2. **决策支持**：提供决策树和检查清单
3. **场景化指导**：明确"何时使用"和"何时不使用"
4. **视觉引导**：使用 emoji 标记增强注意力
5. **示例驱动**：提供正反面对比示例

实施建议按优先级分为 7 个阶段，可以根据实际效果逐步推进和调整。
