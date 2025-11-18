# Implementation Plan

## Phase 1: Core Constraint Enhancement (High Priority)

- [ ] 1. Add critical rules section to Main Agent Objective
  - Add "🚨 关键规则（必须遵守）" section at the very beginning of `packages/server/src/core/systemPrompt/main/objective.md`
  - Emphasize two most important rules: completionResult mandatory, single tool per turn
  - Add checkpoint mechanism in workflow section with decision points
  - Update workflow step 5 to include explicit checkpoint: "评估任务是否完成"
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2, 6.2, 8.1, 8.2_

- [x] 2. Optimize Tool Use Guide with key constraints section
  - Rewrite `packages/server/src/core/systemPrompt/tooluseGuide.md` to add a dedicated "🚫 关键约束（必须严格遵守）" section at the top
  - Add "约束 1：单次工具调用限制" with clear examples showing ❌ wrong and ✅ correct patterns
  - Add "约束 2：任务完成必须调用 completionResult" with examples of incorrect direct replies vs correct tool usage
  - Include XML format examples for proper parameter structure (nested objects, arrays)
  - Add decision support section with tool selection priority guide
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 7.2, 7.3, 8.1, 8.2_

- [x] 3. Enhance Main Agent rules with reinforced constraints
  - Update `packages/server/src/core/systemPrompt/main/rules.md` to strengthen existing constraints
  - Ensure "单次工具调用限制" is first under 硬性约束 with "为什么这很重要" explanation
  - Ensure "任务完成标记" is second with multiple emphasis points and consequences
  - Add cross-references between rules and tools (e.g., mention completionResult in multiple sections)
  - Expand "禁止行为清单" with specific examples from common errors
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 4. Enhance Sub Agent prompts for consistency
  - [x] 4.1 Update `packages/server/src/core/systemPrompt/sub/objective.md`
    - Add same "🚨 关键规则" section as Main Agent for consistency
    - Maintain all hard constraints from Main Agent
    - Emphasize "专注执行，不做额外规划" principle
    - _Requirements: 3.1, 3.5, 8.1, 8.2, 8.3, 8.4_

  - [x] 4.2 Update `packages/server/src/core/systemPrompt/sub/rules.md`
    - Inherit hard constraints from Main Agent (single tool call, completionResult)
    - Keep rules concise and avoid redundancy
    - Strengthen "无冗余对话" requirement
    - _Requirements: 1.1, 1.2, 3.1, 3.5, 8.1, 8.2, 8.3_

## Phase 2: askFollowupQuestion Tool Optimization (High Priority)

- [x] 5. Add self-check mechanism to askFollowupQuestion tool
  - Update `packages/server/src/core/tools/askFollowupQuestions.ts` to add comprehensive usage guidance
  - Add "⚠️ 使用前自我检查" section with 3 questions at the beginning of whenToUse
  - Add "✅ 应该使用的场景" with 4 specific scenarios and examples
  - Add "❌ 不应使用的场景" with 5 specific scenarios and examples
  - Add "参数要求" section explaining suggestOptions best practices
  - Include good vs bad question examples
  - Add explicit mutual exclusion with completionResult
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

## Phase 3: Tool Description Optimization (High Priority)

- [ ] 6. Optimize completionResult tool with 7-point reinforcement
  - Update `packages/server/src/core/tools/completionResult.ts` to enhance description and whenToUse fields
  - Add 🎯 【必须使用】marker to description
  - Expand whenToUse with "**关键规则：任何任务完成后，你必须使用此工具来结束任务。**" at the top
  - Add "适用场景" section with 3 specific scenarios
  - Add "严禁行为" section listing what NOT to do (direct replies, saying "任务完成" without tool)
  - Add "不使用此工具的后果" section explaining impact on system state
  - Add 3 error examples and 3 correct examples in useExamples
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 7.2_

- [ ] 7. Optimize assignTasks tool with tool name validation
  - Update `packages/server/src/core/tools/assignTasks.ts` to strengthen tool name validation guidance
  - Add "🚫 关键约束：工具名称验证" section at the beginning of whenToUse
  - Add 4-point checklist: only use listed tools, exact match required, leave empty if unsure, consequences of invalid tools
  - Emphasize that tool names must exactly match available tools (case-sensitive)
  - Update examples to clearly show "no tools available" scenario vs "tools available" scenario
  - Add explicit warning about consequences of using non-existent tools
  - _Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4_

- [ ] 8. Optimize updateTodolist tool for clarity
  - Update `packages/server/src/core/tools/todolist.ts` to clarify it's an internal planning tool
  - Emphasize in description that this is NOT for user-facing output
  - Add Markdown format examples with proper checkbox syntax
  - Explain how to mark completion status ([x] vs [ ])
  - Add example showing mix of completed and pending items
  - _Requirements: 4.4, 5.1, 5.2, 6.1, 6.3, 7.2_

## Phase 4: Decision Support Mechanisms (High Priority)

- [ ] 9. Add task completion decision tree to prompts
  - Update `packages/server/src/core/systemPrompt/main/objective.md` to include decision tree in workflow
  - Add visual decision tree: "所有计划步骤都已完成？" → "用户请求已得到完整回答？" → "✅ 立即调用 completionResult"
  - Update `packages/server/src/core/systemPrompt/tooluseGuide.md` to include same decision tree
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 6.3, 6.4, 8.1, 8.2, 8.3, 8.4_

- [ ] 10. Add tool selection priority guide
  - Update `packages/server/src/core/systemPrompt/tooluseGuide.md` to add tool selection priority section
  - Create numbered priority list: 1. completionResult (highest), 2. assignTasks, 3. askFollowupQuestion, 4. updateTodolist, 5. other tools
  - Add explanation for each priority level
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 6.3, 6.4_

## Phase 5: Tool Prompt Generator Enhancement (Medium Priority)

- [ ] 11. Enhance generateToolsPrompt function
  - Update `packages/server/src/core/systemPrompt/tools.ts` to prioritize completionResult
  - Implement sorting logic to place completionResult first in tool list
  - Add 🎯 【优先级最高 - 任务完成必用】marker for completionResult in generated prompt
  - Improve parameter type descriptions with format examples
  - Enhance the dynamic tool list injection for assignTasks with warning text before and after
  - _Requirements: 1.3, 1.4, 3.1, 3.2, 3.3, 4.1, 4.4, 5.3, 5.4, 7.1, 7.2, 7.3, 7.4_

## Phase 6: Example Quality Enhancement (Medium Priority)

- [ ] 12. Add comprehensive examples to completionResult
  - [ ] 12.1 Add 3 error examples to completionResult
    - Update `packages/server/src/core/tools/completionResult.ts` useExamples array
    - Example 1: Direct reply without tool (❌ "任务已完成！结果是...")
    - Example 2: Saying "任务完成" in plain text (❌ "好的，我已经完成了所有步骤。任务完成。")
    - Example 3: Using another tool when task is done (❌ using askFollowupQuestion after completion)
    - Mark each with ❌ and explain why it's wrong
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

  - [ ] 12.2 Add 3 correct examples to completionResult
    - Example 1: Simple task completion with minimal content
    - Example 2: Complex task completion with detailed summary
    - Example 3: Information query completion
    - Mark each with ✅ and explain why it's correct
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

- [ ] 13. Add contrast examples to askFollowupQuestion
  - [ ] 13.1 Add 2 good usage examples
    - Update `packages/server/src/core/tools/askFollowupQuestions.ts` useExamples array
    - Example 1: Ambiguous request requiring clarification (✅ "优化代码" → ask which aspect)
    - Example 2: User needs to choose between options (✅ database selection)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3_

  - [ ] 13.2 Add 2 bad usage examples
    - Example 1: Unnecessary confirmation (❌ "您确定要读取文件吗？")
    - Example 2: Asking when task is complete (❌ asking "还需要什么" after finishing)
    - Mark with ❌ and explain why it's wrong
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3_

- [ ] 14. Enhance other tool examples
  - [ ] 14.1 Enhance assignTasks examples with annotations
    - Update existing examples in `packages/server/src/core/tools/assignTasks.ts`
    - Add inline comments explaining key parts (tool validation, empty tools, etc.)
    - Add example showing "no tools available" scenario
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4_

  - [ ] 14.2 Add second example to updateTodolist showing progress update
    - Update `packages/server/src/core/tools/todolist.ts` useExamples array
    - Show example with mix of completed [x] and pending [ ] items
    - _Requirements: 5.1, 5.2, 6.1, 6.3_

## Phase 7: Structure and Visual Enhancement (Low Priority)

- [ ] 15. Apply consistent visual markers across all prompt files
  - Review and update all markdown files in `packages/server/src/core/systemPrompt/` to use consistent emoji markers
  - Use 🚨 for critical rules, 🚫 for hard constraints, ⚠️ for important principles, 💡 for best practices, 🎯 for goals, ✅ for correct, ❌ for incorrect
  - Ensure consistent heading hierarchy and separator usage (=====)
  - Verify all key rules use Level 1 language (必须、严禁、唯一正确方式)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.3, 7.5_

- [ ] 16. Add XML format self-check guidance
  - Update `packages/server/src/core/systemPrompt/tooluseGuide.md` to add XML format validation section
  - Add checklist for common XML errors (missing closing tags, wrong parameter names, type mismatches)
  - Provide examples of correct nested structures and arrays
  - Emphasize case-sensitivity of tool and parameter names
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

## Phase 8: Testing and Validation (Continuous)

- [ ]* 17. Create integration tests for model behavior
  - Create test file `packages/server/src/core/systemPrompt/__tests__/modelBehavior.test.ts`
  - Test single tool call per turn constraint
  - Test completionResult usage on task completion
  - Test valid tool names in assignTasks
  - Test askFollowupQuestion not used when information is sufficient
  - Test checkpoint mechanism triggers at correct points
  - _Requirements: All requirements (validation)_

- [ ]* 18. Create unit tests for prompt generation
  - Create test file `packages/server/src/core/systemPrompt/__tests__/tools.test.ts`
  - Test completionResult appears first in generated prompt
  - Test tool list injection for assignTasks includes warning text
  - Test parameter description generation for nested structures
  - Test visual markers are correctly applied
  - _Requirements: 1.3, 1.4, 4.1, 4.2, 5.3, 7.3_

- [ ]* 19. Conduct A/B testing and metrics collection
  - Set up metrics collection for: completionResult usage rate, single tool call compliance rate, askFollowupQuestion appropriateness, tool name accuracy
  - Compare optimized prompts vs original prompts
  - Collect user feedback on "model not following instructions" issues
  - Adjust prompts based on data (iterate on phases 1-7 as needed)
  - _Requirements: All requirements (validation and iteration)_
