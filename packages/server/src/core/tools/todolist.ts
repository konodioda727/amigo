import { createTool } from "./base";

// 假设 parseMarkdownChecklist 保持不变
function parseMarkdownChecklist(markdown: string): { target: string; completed: boolean }[] {
  const lines = markdown
    .split("\n")
    .filter((line) => line.trim().startsWith("- [") || line.trim().startsWith("* ["));
  return lines.map((line) => {
    const isCompleted = line.includes("[x]") || line.includes("[X]");
    // 移除 - [ ] 或 - [x] / * [ ] 或 * [x] 标记
    const target = line.replace(/^[-\*]\s*\[[xX\s]\]\s*/, "").trim();
    return { target, completed: isCompleted };
  });
}

export const UpdateTodolist = createTool({
  name: "updateTodolist",
  description:
    "💡 【内部规划工具】用于创建、更新或替换当前任务的待办事项列表（To-Do List）。**这是 Agent 的内部规划和状态跟踪机制，不是用户界面工具。**",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个**内部规划工具**，用于帮助你组织思路和跟踪任务进度。它不会直接显示给用户，用户看不到 Checklist 格式。\n\n" +
    "**适用场景：**\n" +
    "1. **任务分解时：** 当用户请求是一个复杂的任务，需要拆解为多个步骤时，使用此工具创建初始的待办列表\n" +
    "2. **进度更新时：** 当一个步骤已完成或需要修改时，使用此工具更新列表状态（标记为完成 `[x]`）或修改任务描述\n" +
    "3. **自我提醒时：** 需要记录下一步要做什么，避免遗漏步骤\n\n" +
    "**🚫 重要限制：**\n" +
    "- ❌ 不要将 Checklist 格式直接作为对用户的最终回复\n" +
    "- ❌ 不要认为用户能看到这个待办列表\n" +
    "- ✅ 这只是你的内部规划工具，用于自我管理\n\n" +
    "**Markdown 格式说明：**\n" +
    "- 使用 `- [ ]` 表示未完成的任务\n" +
    "- 使用 `- [x]` 或 `- [X]` 表示已完成的任务\n" +
    "- 也可以使用 `* [ ]` 和 `* [x]` 格式\n" +
    "- 每个任务项占一行\n\n" +
    "**格式示例：**\n" +
    "```markdown\n" +
    "- [ ] 第一个待完成的任务\n" +
    "- [x] 第二个已完成的任务\n" +
    "- [ ] 第三个待完成的任务\n" +
    "```",

  useExamples: [
    `<updateTodolist>
      <todolist>
- [ ] 分析用户需求，确定旅行目的地和时间
- [x] 查询并预订北京到上海的往返机票
- [ ] 查找并预订上海评分高于4.5的五星级酒店
- [ ] 制定详细的上海三日游行程安排
      </todolist>
    </updateTodolist>`,
    `<updateTodolist>
      <todolist>
- [ ] 收集关于“量子计算”的最新研究进展。
- [ ] 撰写一份关于量子计算的应用前景的摘要。
- [ ] 整理摘要并润色，确保语言专业流畅。
      </todolist>
    </updateTodolist>`,
  ],

  // 定义模型需要输出的 XML 标签和结构
  params: [
    {
      name: "todolist",
      optional: false,
      description:
        "完整的 Markdown 格式的待办事项列表 (Checklist)，使用 `- [ ]` 或 `- [x]` 标记状态。",
    },
  ],

  /**
   * 工具的实际执行逻辑
   * 在实际应用中，这里应该触发一个子任务流程，
   * 根据 params 中的 todolist 逐一创建和启动子 ConversationManager。
   */
  async invoke({params}) {
    const markdownList = params.todolist;
    const checklist = parseMarkdownChecklist(markdownList);

    const total = checklist.length;
    const completed = checklist.filter((item) => item.completed).length;

    // 查找第一个未完成的任务
    const nextPendingTask = checklist.find((item) => !item.completed);

    let resultMessage = `
    成功更新 ${total} 个待办事项。当前进度：${completed}/${total} (已完成/总数)。
    `;

    if (nextPendingTask) {
      // 告诉模型下一个要做的任务是什么
      resultMessage += `\n**下一个任务：** ${nextPendingTask.target}`;
    } else {
      // 如果所有任务都完成了
      resultMessage += `\n**所有任务已完成。** 请提供最终总结。`;
    }

    // 返回一个格式化的成功消息给 LLM
    return {
      message: resultMessage,
      toolResult: resultMessage
    };
  },
});