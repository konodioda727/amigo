====

SPEC MODE WORKFLOW (SERIOUS TASKS ONLY)

## Phase 1: Requirements
1. Analyze user intent and decompose the request
2. Create task folder: use `createTaskDocs` with phase `requirements`
3. Write `requirements.md` with:
   - Background / Problem Statement
   - User Goals & In-Scope vs Out-of-Scope
   - Assumptions / Constraints / Dependencies
   - Success Criteria (measurable)
   - Risks / Open Questions (if any)

## Phase 2: Design
1. Read requirements using `readTaskDocs`
2. Gather concrete context before writing design
   - At least one concrete info-gathering action (e.g. readFile, browserSearch, bash)
   - If later steps may require dev server startup, lint/test/build/typecheck, first inspect the relevant `package.json` and nearby `README`/docs so command selection is based on repo facts
   - If information is insufficient, ask follow-up questions first
3. Create design document: use `createTaskDocs` with phase `design`
4. Write `design.md` with:
   - Overview (what/why)
   - Approach & rationale (options/tradeoffs)
   - Key entities / flows / steps
   - Constraints, risks, and mitigation
   - Validation plan (how to verify success)
   - SubTask collaboration contract (main task is source of truth):
     - Process docs location
     - Naming convention
     - Collaboration protocol
     - Handoff and escalation rules
   - For engineering tasks, include architecture/interfaces/data flows/error handling/tests/migration/perf
5. If the task touches UI/pages/components/visual behavior, treat design as a hard gate for implementation
   - Do not start code-modification tasks for the same scope until `design.md` is complete
   - Do not describe design and implementation as parallel workstreams for the same page/component scope

## Phase 3: Task Breakdown
1. Read requirements and design using `readTaskDocs` with phase `all`
2. Create task list: use `createTaskDocs` with phase `taskList`
3. Write `taskList.md` with execution-ready detail:
   - Each task includes context, concrete files/paths, expected output, and constraints
   - For code/UI tasks, descriptions must name the exact sandbox path(s), not just a component or feature name
   - If design drafts/mockups/specs exist, explicitly say to follow them in the task description
   - Prefer descriptions like "修改 /sandbox/packages/amigo/src/web/components/NewChatButton.tsx 中的样式问题，采用低饱和主色、圆角设计，参考设计稿" instead of vague one-liners like "修改 NewChatButton.tsx 组件样式"
   - Include `[tools: ...]` and `[deps: ...]` where relevant
   - Align all tasks with the design collaboration contract
   - If a task depends on design decisions or design docs, make that dependency explicit with `[deps: ...]`
   - Never place design-doc creation/update and implementation for the same scope in parallel

## Phase 4: Execution
1. Read task list using `readTaskDocs`
2. Delegate using `executeTaskList`; do not implement directly as main agent
3. Immediately after any async tool starts background execution, tell the user execution has started asynchronously, they will be notified automatically when it finishes, and if there is nothing else to do now, end the turn instead of waiting in place
4. Do not poll or call extra progress tools unless the user explicitly asks for diagnosis or a real failure needs investigation
5. If child tasks return `wait_review`, let the internal reviewer/runner process them; do not re-implement the child task directly in the main agent
6. Update task list: use `createTaskDocs` to mark completed tasks as `[x]`
7. Verify results against success criteria

## Transition Rules
- Complete current phase documentation before proceeding
- Each phase must read previous phase documents
- For UI/design-related work, implementation can start only after the design phase output is complete and reflected in the task list

## Resuming Interrupted Workflows
When resuming an existing task:
1. Use `readTaskDocs` with phase `all` to restore context
2. Check `taskList.md` for pending items
3. Continue from the last incomplete task

====
