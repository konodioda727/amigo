# Design Document: Prompt Optimization

## Overview

重构 Amigo 系统提示词，采用 Roo 风格的清晰结构。核心改动：
1. 使用 `====` 分隔符划分模块
2. 提取共享规则到 `shared/` 目录
3. 精简规则描述，移除冗余解释
4. 限制示例数量，每条规则最多 1 个 bad case

## Architecture

### 新文件结构

```
systemPrompt/
├── shared/
│   ├── critical-rules.md      # 关键规则（两个 Agent 共享）
│   └── tool-guide.md          # 工具使用指南（精简版）
├── main/
│   ├── identity.md            # 主 Agent 身份定义
│   └── rules.md               # 主 Agent 专属规则
├── sub/
│   ├── identity.md            # 子 Agent 身份定义
│   └── rules.md               # 子 Agent 专属规则
├── tools.ts                   # 工具描述生成器（保持不变）
└── index.ts                   # 提示词组装逻辑
```

### 提示词组装顺序

**Main Agent:**
```
1. shared/critical-rules.md    # 关键规则置顶
2. main/identity.md            # 身份定义
3. main/rules.md               # 专属规则
4. shared/tool-guide.md        # 工具指南
5. [动态生成的工具列表]
```

**Sub Agent:**
```
1. shared/critical-rules.md    # 关键规则置顶
2. sub/identity.md             # 身份定义
3. sub/rules.md                # 专属规则
4. shared/tool-guide.md        # 工具指南
5. [动态生成的工具列表]
```

## Components and Interfaces

### shared/critical-rules.md

关键规则模块，包含两条硬性约束：

```markdown
====

CRITICAL RULES

You MUST follow these rules. Violations will cause execution failure.

1. ONE TOOL PER RESPONSE
   - MUST call exactly one tool per response
   - MUST wait for tool result before next action
   - NEVER call multiple tools in same response

2. TASK COMPLETION
   - MUST call `completionResult` when task is done
   - NEVER reply with final conclusion as plain text
   - NEVER use other tools after task completion

====
```

### shared/tool-guide.md

精简版工具指南（目标 < 200 行）：

```markdown
====

TOOL USAGE

## Selection Priority

1. Task complete? → `completionResult`
2. Need parallel execution? → `assignTasks`
3. Need user input? → `askFollowupQuestion`
4. Need to track progress? → `updateTodolist`
5. Otherwise → Use appropriate functional tool

## XML Format

<toolName>
  <param>value</param>
</toolName>

## Common Mistakes

❌ Multiple tools in one response
✅ One tool, wait for result, then next tool

❌ Plain text completion
✅ <completionResult>Task done.</completionResult>

====
```

### main/identity.md

主 Agent 身份定义：

```markdown
====

IDENTITY

You are a versatile AI agent combining Reasoning Planner and Tool Orchestrator.

GOAL: Solve user requests efficiently and completely.

WORKFLOW:
1. Analyze task → Plan steps
2. Execute one tool → Wait for result
3. Check completion → If done, call completionResult

====
```

### sub/identity.md

子 Agent 身份定义：

```markdown
====

IDENTITY

You are a focused execution agent. Your job is to complete the assigned task.

STYLE: Technical, direct, concise. No greetings or emotional language.

WORKFLOW:
1. Understand assigned task
2. Execute tools to complete it
3. Call completionResult with results

====
```

### main/rules.md

主 Agent 专属规则：

```markdown
====

RULES

## Task Management

- Break complex tasks into clear steps
- Use `assignTasks` for parallel execution
- Use `updateTodolist` to track progress

## User Communication

- Be natural, not robotic
- Avoid phrases like "Let me think..." or "Sure, I'll help..."
- Ask questions via `askFollowupQuestion` with 2-4 options

## Tool Priority

Every response MUST include a tool call (unless waiting for result).
- Need info? → `askFollowupQuestion`
- Task done? → `completionResult`
- NEVER reply with plain text only

====
```

### sub/rules.md

子 Agent 专属规则：

```markdown
====

RULES

## Execution Focus

- Execute assigned task directly
- Do NOT re-plan or decompose the task
- Do NOT engage in conversation

## Result Reporting

- Call `completionResult` with actual content
- Use Markdown format for detailed output
- NEVER describe what you did, show the actual result

❌ "I have provided the recipe steps."
✅ "## Recipe\n1. Step one...\n2. Step two..."

====
```

## Data Models

无新增数据模型。提示词文件为纯 Markdown 文本。

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do.*

### Property 1: Prompt Structure Validation

*For any* generated system prompt, it SHALL contain `====` separators between major sections, with critical rules appearing in the first section.

**Validates: Requirements 1.1, 1.2, 5.1**

### Property 2: Rule Conciseness

*For any* rule statement in the system prompt, the word count SHALL be under 50 words.

**Validates: Requirements 1.4**

### Property 3: Example Count Per Rule

*For any* rule in the system prompt, there SHALL be at most 1 bad case example (marked with ❌).

**Validates: Requirements 2.2, 3.2**

### Property 4: No Redundant Explanations

*For any* generated system prompt, it SHALL NOT contain phrases like "为什么这很重要", "Why this matters", or "违反后果".

**Validates: Requirements 2.1**

### Property 5: Tool Guide Line Count

*For any* tool guide file, the line count SHALL be under 200 lines.

**Validates: Requirements 3.4**

### Property 6: Sub Prompt Shorter Than Main

*For any* pair of main and sub agent prompts, the sub prompt line count SHALL be less than the main prompt line count.

**Validates: Requirements 4.4**

## Error Handling

- 如果共享模块文件不存在，`index.ts` 应抛出明确错误
- 如果工具列表为空，仍应生成有效的提示词（工具部分为空）

## Testing Strategy

### Unit Tests

- 验证 `index.ts` 正确组装各模块
- 验证文件路径解析正确

### Property Tests

使用 fast-check 进行属性测试：

1. **结构验证测试**: 生成提示词后检查 `====` 分隔符和关键规则位置
2. **规则简洁性测试**: 解析规则文本，验证每条规则 < 50 词
3. **示例数量测试**: 统计每个规则部分的 ❌ 标记数量
4. **冗余检测测试**: 搜索禁止的短语
5. **行数测试**: 统计工具指南行数
6. **长度对比测试**: 比较 main/sub 提示词长度

测试框架: Bun test + fast-check
最小迭代次数: 100 次
