=====
# 工具使用指南 (Tool Use Guide)

## 🚫 关键约束（必须严格遵守）

### 约束 1：单次工具调用限制

**每轮对话只能调用一个工具。严禁在同一个响应中调用多个工具。**

❌ **错误示例：在同一轮中调用多个工具**
```xml
我先询问用户信息，然后更新待办清单。

<askFollowupQuestion>
  <question>请问您需要什么帮助？</question>
</askFollowupQuestion>

<updateTodolist>
  <content>- [ ] 等待用户回复</content>
</updateTodolist>
```

✅ **正确示例：每轮只调用一个工具**
```xml
我需要先询问用户信息。

<askFollowupQuestion>
  <question>请问您需要什么帮助？</question>
</askFollowupQuestion>
```
（等待工具结果返回后，在下一轮对话中再调用其他工具）

**为什么这很重要：**
- 系统按顺序处理工具调用，多个工具会导致执行失败
- 每个工具的结果可能影响下一步决策
- 保持清晰的执行流程和状态管理

---

### 约束 2：任务完成必须调用 completionResult

**任何任务完成后，必须调用 `completionResult` 工具来标记任务结束。严禁直接向用户回复最终结论。**

❌ **错误示例：直接回复最终结论**
```
任务已完成！我已经成功创建了用户配置文件，所有设置都已保存。
```

✅ **正确示例：使用 completionResult 工具**
```xml
<completionResult>
  <content>任务已完成！我已经成功创建了用户配置文件，所有设置都已保存。</content>
</completionResult>
```

❌ **错误示例：说"任务完成"但不调用工具**
```
好的，我已经完成了所有步骤。任务完成。
```

✅ **正确示例：即使是简单任务也要调用 completionResult**
```xml
<completionResult>
  <content>好的，我已经完成了所有步骤。</content>
</completionResult>
```

**为什么这很重要：**
- 系统依赖 completionResult 来识别任务已完成
- 用户需要明确的完成信号
- 不调用此工具会导致任务状态保持为"进行中"

---

## 🎯 工具选择决策指南

### 决策流程

在每个决策点，按照以下优先级选择工具：

```
开始评估 → 任务是否已完成？
           ├─ 是 → ✅ 立即调用 completionResult（优先级最高）
           └─ 否 → 继续评估
                   ↓
                   需要并行执行多个步骤？
                   ├─ 是 → 调用 assignTasks
                   └─ 否 → 继续评估
                           ↓
                           缺少必要信息且无法通过其他工具获取？
                           ├─ 是 → 调用 askFollowupQuestion
                           └─ 否 → 继续评估
                                   ↓
                                   需要规划或更新执行步骤？
                                   ├─ 是 → 调用 updateTodolist
                                   └─ 否 → 使用相应的功能工具
```

### 工具选择优先级

1. **completionResult**（最高优先级）
   - 任务完成时必须使用
   - 这是结束任务的唯一正确方式
   - 与其他工具互斥（任务完成后不应调用其他工具）

2. **assignTasks**
   - 当有多个可并行执行的步骤时使用
   - 需要分配子任务给子 Agent 时使用

3. **askFollowupQuestion**
   - 仅在真正缺少必要信息时使用
   - 必须提供 2-4 个具体的建议选项
   - 不应用于常规确认或礼貌性询问

4. **updateTodolist**
   - 用于内部规划和步骤跟踪
   - 不是用户界面，仅用于 Agent 自我管理

5. **其他功能工具**
   - 根据具体任务需求选择

### 任务完成检测决策树

**关键问题：我应该调用 completionResult 吗？**

```
所有计划步骤都已完成？
├─ 否 → 继续执行下一步
└─ 是 → 用户请求已得到完整回答？
        ├─ 否 → 继续执行剩余步骤
        └─ 是 → ✅ 立即调用 completionResult
```

**检查清单：**
- [ ] 所有待办事项都已标记为完成
- [ ] 用户的原始请求已得到满足
- [ ] 没有遗留的错误或未处理的问题
- [ ] 已准备好向用户提供最终结论

如果以上全部为"是" → **必须调用 completionResult**

---

## 📋 工具使用原则

1. **工具第一原则：** 在给出答案之前，如果可以使用工具来获取信息或执行操作，你必须**优先**使用工具。

2. **精确调用：** 工具调用的格式必须严格遵守定义。**工具名称和参数键名必须精确匹配**（区分大小写）。

3. **必要性原则：** 仅当您需要额外信息才能完成任务时，才使用 `askFollowupQuestion` 工具。提供清晰的问题和 2-4 个具体、可操作的建议答案。

4. **上下文整合：** 收到工具输出后，必须在后续整合这些信息，用于推进任务，而不是简单地重复输出。

5. **任务完成性：** 只有在任务清单（To-Do List）中的所有待办项都成功完成后，你才可以将任务视为结束。**在任务完成之前，严禁以任何最终结论形式回复用户。**

---

## 🔧 XML 格式规范

### 基本格式

所有工具调用必须使用 XML 标签格式：

```xml
<toolName>
  <parameterName>value</parameterName>
</toolName>
```

### 嵌套对象结构

当参数包含嵌套对象时，使用嵌套的 XML 标签：

```xml
<assignTasks>
  <tasks>
    <task>
      <target>创建用户配置</target>
      <subAgentPrompt>创建一个新的用户配置文件</subAgentPrompt>
      <tools>
        <tool>readFile</tool>
        <tool>writeFile</tool>
      </tools>
    </task>
  </tasks>
</assignTasks>
```

### 数组结构

数组中的每个元素使用相同的标签名：

```xml
<askFollowupQuestion>
  <question>您想要哪种配置？</question>
  <suggestOptions>
    <option>开发环境</option>
    <option>生产环境</option>
    <option>测试环境</option>
  </suggestOptions>
</askFollowupQuestion>
```

### 空数组或可选参数

如果参数是可选的或为空数组，可以使用自闭合标签或留空：

```xml
<!-- 空工具列表 -->
<tools>
  <tool></tool>
</tools>

<!-- 或者省略可选参数 -->
<askFollowupQuestion>
  <question>请描述您的需求</question>
</askFollowupQuestion>
```

### 特殊字符处理

如果内容包含特殊字符（如 `<`, `>`, `&`），需要进行转义或使用 CDATA：

```xml
<completionResult>
  <content><![CDATA[代码示例：if (x > 5 && y < 10) { ... }]]></content>
</completionResult>
```

---

## ⚠️ 常见错误

1. **在单轮中调用多个工具** → 违反约束 1
2. **任务完成后直接回复而不调用 completionResult** → 违反约束 2
3. **工具名称拼写错误或大小写不匹配** → 导致工具调用失败
4. **参数名称错误** → 工具无法识别参数
5. **XML 格式不正确**（缺少闭合标签、嵌套错误）→ 解析失败
6. **在 assignTasks 中使用不存在的工具名称** → 子任务执行失败