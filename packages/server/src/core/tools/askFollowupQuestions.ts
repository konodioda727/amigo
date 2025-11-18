import { createTool } from './base';

export const AskFollowupQuestions = createTool({
  name: "askFollowupQuestion",
  description: "询问用户后续问题以获取必要信息",
  whenToUse:
    "⚠️ **使用前自我检查：**\n" +
    "在调用此工具前，请先问自己：\n" +
    "1. 我是否真的缺少必要信息？\n" +
    "2. 这个信息能否通过其他工具获取？\n" +
    "3. 任务是否已经完成？（如果是，应调用 completionResult）\n\n" +
    "**✅ 应该使用的场景：**\n" +
    "1. **用户请求不明确或有歧义** - 例如：「优化代码」但未说明优化什么方面（性能？可读性？内存？）\n" +
    "   示例：用户说「帮我优化这个函数」，但没有说明优化目标\n\n" +
    "2. **需要用户在多个方案中做选择** - 例如：选择使用 REST API 还是 GraphQL\n" +
    "   示例：用户说「创建一个 API」，需要确定使用哪种技术栈\n\n" +
    "3. **缺少必要的参数或配置信息** - 例如：API 密钥、数据库连接信息、环境变量\n" +
    "   示例：用户要求「连接数据库」，但没有提供连接字符串\n\n" +
    "4. **需要确认可能有风险的操作** - 例如：删除数据、修改重要配置、覆盖现有文件\n" +
    "   示例：用户要求「删除所有日志文件」，需要确认是否包括最近的日志\n\n" +
    "**❌ 不应使用的场景：**\n" +
    "1. **你已经有足够信息完成任务** - 不要为了「确认」而询问\n" +
    "   错误示例：用户说「读取 config.json」，你问「您确定要读取吗？」\n\n" +
    "2. **可以通过 readFile、listDirectory 等工具获取的信息** - 直接使用工具而不是询问\n" +
    "   错误示例：用户说「检查项目结构」，你问「项目有哪些文件？」（应该直接用 listDirectory）\n\n" +
    "3. **任务已经完成** - 此时必须使用 completionResult，不要询问「还需要什么」\n" +
    "   错误示例：完成所有步骤后问「您还需要我做什么吗？」（应该调用 completionResult）\n\n" +
    "4. **只是想确认「是否继续」** - 如果任务明确，直接执行\n" +
    "   错误示例：用户说「创建组件」，你问「我现在开始创建吗？」\n\n" +
    "5. **询问用户对结果是否满意** - 应在 completionResult 中说明结果，让用户主动反馈\n" +
    "   错误示例：完成任务后问「这个结果您满意吗？」\n\n" +
    "**🚫 与 completionResult 的互斥关系：**\n" +
    "- 如果任务已经完成，必须调用 completionResult，不能使用 askFollowupQuestion\n" +
    "- 不要在任务完成后询问用户「还需要什么」或「是否满意」\n" +
    "- completionResult 是结束任务的唯一正确方式",
  useExamples: [
    `// ✅ 正确示例 1：用户请求不明确
// 用户说：「优化代码」
<askFollowupQuestion>
  <question>您希望优化代码的哪个方面？</question>
  <suggestOptions>
    <option>性能优化（减少执行时间）</option>
    <option>可读性优化（改进代码结构）</option>
    <option>内存优化（减少内存占用）</option>
    <option>安全性优化（修复安全漏洞）</option>
  </suggestOptions>
</askFollowupQuestion>`,
    `// ✅ 正确示例 2：需要用户选择技术方案
// 用户说：「创建一个 API 服务」
<askFollowupQuestion>
  <question>您希望使用哪种 API 架构？</question>
  <suggestOptions>
    <option>REST API（传统 HTTP 接口）</option>
    <option>GraphQL（灵活查询）</option>
    <option>gRPC（高性能 RPC）</option>
  </suggestOptions>
</askFollowupQuestion>`,
    `// ❌ 错误示例 1：不必要的确认
// 用户说：「读取 config.json 文件」
// 错误做法：
<askFollowupQuestion>
  <question>您确定要读取 config.json 文件吗？</question>
  <suggestOptions>
    <option>是的，读取</option>
    <option>不，取消</option>
  </suggestOptions>
</askFollowupQuestion>
// 正确做法：直接使用 readFile 工具读取文件`,
    `// ❌ 错误示例 2：任务完成后询问
// 已经完成所有步骤
// 错误做法：
<askFollowupQuestion>
  <question>任务已完成，您还需要什么帮助吗？</question>
  <suggestOptions>
    <option>继续优化</option>
    <option>添加测试</option>
    <option>不需要了</option>
  </suggestOptions>
</askFollowupQuestion>
// 正确做法：调用 completionResult 结束任务`,
  ],
  params: [
    {
      name: "question",
      optional: false,
      description: "要向用户提出的问题。必须清晰、具体，避免开放式问题。\n✅ 好的问题：「您希望使用哪种数据库？」\n❌ 不好的问题：「您还需要什么？」",
    },
    {
      name: "suggestOptions",
      optional: false,
      description: "为用户提供的建议选项列表。必须提供 2-4 个具体、可操作的选项。选项应该是互斥的（不重叠）、完整的（覆盖主要情况），每个选项都应该是明确的行动方案。\n✅ 好的选项：[\"PostgreSQL\", \"MySQL\", \"MongoDB\", \"SQLite\"]\n❌ 不好的选项：[\"是\", \"否\", \"可能\"]",
      type: 'array',
      params: [
        {
          name: "option",
          optional: false,
          description: "一个具体的建议选项",
        }
      ]
    },
  ],
  async invoke({params}) {
    return {
      message: `已向用户提出后续问题: ${params.question}`,
      toolResult: ''
    };
  },
});
