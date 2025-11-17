# Implementation Plan

## Phase 1: Core Constraint Enhancement (High Priority)

- [ ] 1. Optimize Tool Use Guide with key constraints section
  - Rewrite `packages/server/src/core/systemPrompt/tooluseGuide.md` to add a dedicated "🚫 关键约束（必须严格遵守）" section
  - Add "约束 1：单次工具调用限制" with clear examples showing ❌ wrong and ✅ correct patterns
  - Add "约束 2：任务完成必须调用 completionResult" with examples of incorrect direct replies vs correct tool usage
  - Include XML format examples for proper parameter structure (nested objects, arrays)
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 7.2, 7.3_

- [ ] 2. Enhance Main Agent objective and rules
  - [x] 2.1 Update `packages/server/src/core/systemPrompt/main/objective.md`
    - Modify "核心工作模式" section to emphasize: 🎯 规划先行, 🔧 单次调用, ✅ 明确完成
    - Add explicit statement that completionResult is mandatory for task completion
    - Simplify "规划先行" description to avoid over-emphasis that might overshadow other rules
    - _Requirements: 2.1, 2.2, 3.1, 4.1, 4.2_

  - [x] 2.2 Rewrite `packages/server/src/core/systemPrompt/main/rules.md`
    - Restructure with three priority levels: 🚫 硬性约束, ⚠️ 重要原则, 💡 最佳实践
    - Move "单次工具调用限制" to first position under 硬性约束
    - Add "任务完成标记" as second hard constraint with strong language (严禁, 必须)
    - Include "禁止行为清单" section listing common mistakes
    - _Requirements: 2.1, 2.3, 2.5, 3.1, 3.3, 4.2, 4.3, 7.1, 7.2_

- [ ] 3. Enhance Sub Agent objective and rules
  - [x] 3.1 Update `packages/server/src/core/systemPrompt/sub/objective.md`
    - Maintain consistency with Main Agent constraints
    - Add explicit statement about completionResult requirement
    - Emphasize "专注执行，不做额外规划" principle
    - _Requirements: 3.1, 8.1, 8.2, 8.3, 8.4_

  - [x] 3.2 Update `packages/server/src/core/systemPrompt/sub/rules.md`
    - Inherit hard constraints from Main Agent (single tool call, completionResult)
    - Keep rules concise and avoid redundancy
    - Strengthen "无冗余对话" requirement
    - _Requirements: 2.1, 3.1, 8.1, 8.2, 8.3_

## Phase 2: Tool Description Optimization (High Priority)

- [ ] 4. Optimize completionResult tool
  - Update `packages/server/src/core/tools/completionResult.ts` to enhance description and whenToUse fields
  - Add 🎯 【必须使用】marker to description
  - Expand whenToUse to include multiple scenarios (all tasks done, simple tasks, etc.)
  - Add "严禁行为" section listing what NOT to do (direct replies, saying "任务完成" without tool)
  - Add "不使用此工具的后果" section explaining impact on system state
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.4, 5.1, 7.2_

- [ ] 5. Optimize assignTasks tool
  - Update `packages/server/src/core/tools/assignTasks.ts` to strengthen tool name validation guidance
  - Add "🚫 关键约束：工具名称验证" section in whenToUse
  - Emphasize that tool names must exactly match available tools (case-sensitive)
  - Update examples to clearly show "no tools available" scenario vs "tools available" scenario
  - Add explicit warning about consequences of using non-existent tools
  - _Requirements: 1.1, 1.2, 5.1, 5.2, 5.3, 5.4, 5.5, 7.4_

- [ ] 6. Optimize askFollowupQuestion tool
  - Update `packages/server/src/core/tools/askFollowupQuestions.ts` to add "何时不应使用" guidance
  - Add "适用场景" and "不应使用的场景" sections in whenToUse
  - Include best practices for suggestOptions (2-5 options, mutually exclusive, actionable)
  - Add parameter format examples showing optional vs required parameters
  - _Requirements: 4.4, 5.1, 5.2, 6.1, 6.2_

- [ ] 7. Optimize updateTodolist tool
  - Update `packages/server/src/core/tools/todolist.ts` to clarify it's an internal planning tool
  - Emphasize in description that this is NOT for user-facing output
  - Add Markdown format examples with proper checkbox syntax
  - Explain how to mark completion status ([x] vs [ ])
  - _Requirements: 4.4, 5.1, 5.2_

## Phase 3: Tool Prompt Generator Enhancement (Medium Priority)

- [ ] 8. Enhance generateToolsPrompt function
  - Update `packages/server/src/core/systemPrompt/tools.ts` to prioritize completionResult
  - Implement sorting logic to place completionResult first in tool list
  - Add 🎯 【优先级最高 - 任务完成必用】marker for completionResult
  - Improve parameter type descriptions with format examples
  - Enhance the dynamic tool list injection for assignTasks with warning text before and after
  - _Requirements: 1.3, 1.4, 4.1, 4.4, 5.3, 5.4_

## Phase 4: Example Quality Enhancement (Medium Priority)

- [ ] 9. Add second examples for all tools
  - [ ] 9.1 Add second example to completionResult showing simple task completion
    - Update `packages/server/src/core/tools/completionResult.ts` useExamples array
    - Include example with minimal content for quick tasks
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 9.2 Add second example to askFollowupQuestion showing scenario without suggestOptions
    - Update `packages/server/src/core/tools/askFollowupQuestions.ts` useExamples array
    - Demonstrate optional parameter usage
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 9.3 Enhance assignTasks examples with annotations
    - Update existing examples in `packages/server/src/core/tools/assignTasks.ts`
    - Add inline comments explaining key parts (tool validation, empty tools, etc.)
    - _Requirements: 6.1, 6.4, 6.5_

  - [ ] 9.4 Add second example to updateTodolist showing progress update
    - Update `packages/server/src/core/tools/todolist.ts` useExamples array
    - Show example with mix of completed [x] and pending [ ] items
    - _Requirements: 6.1, 6.3_

## Phase 5: Structure and Visual Enhancement (Low Priority)

- [ ] 10. Apply consistent visual markers across all prompt files
  - Review and update all markdown files in `packages/server/src/core/systemPrompt/` to use consistent emoji markers
  - Use 🚫 for hard constraints, ⚠️ for important principles, 💡 for best practices, 🎯 for goals
  - Ensure consistent heading hierarchy and separator usage (=====)
  - _Requirements: 4.1, 4.2, 7.3_

- [ ] 11. Add common mistakes section to tool descriptions
  - For each tool in `packages/server/src/core/tools/`, add a "常见错误" or "注意事项" section
  - List typical misuse patterns and how to avoid them
  - _Requirements: 7.1, 7.2, 7.4_

## Phase 6: Testing and Validation (Continuous)

- [ ]* 12. Create integration tests for model behavior
  - Create test file `packages/server/src/core/systemPrompt/__tests__/modelBehavior.test.ts`
  - Test single tool call per turn constraint
  - Test completionResult usage on task completion
  - Test valid tool names in assignTasks
  - _Requirements: All requirements (validation)_

- [ ]* 13. Create unit tests for prompt generation
  - Create test file `packages/server/src/core/systemPrompt/__tests__/tools.test.ts`
  - Test completionResult appears first in generated prompt
  - Test tool list injection for assignTasks
  - Test parameter description generation for nested structures
  - _Requirements: 1.3, 1.4, 5.3_
