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

## Phase 3: Task Breakdown
1. Read requirements and design using `readTaskDocs` with phase `all`
2. Create task list: use `createTaskDocs` with phase `taskList`
3. Write `taskList.md` with execution-ready detail:
   - Each task includes context, concrete files/paths, and expected output
   - Avoid vague one-liners
   - Include `[tools: ...]` and `[deps: ...]` where relevant
   - Align all tasks with the design collaboration contract

## Phase 4: Execution
1. Read task list using `readTaskDocs`
2. Delegate using `executeTaskList`; do not implement directly as main agent
3. Immediately after calling `executeTaskList`, tell the user execution has started asynchronously, they can close the page, and should wait patiently for automatic completion
4. Use `getTaskListProgress` only when user asks, execution appears stalled, or failure details are needed
5. Update task list: use `createTaskDocs` to mark completed tasks as `[x]`
6. Verify results against success criteria

## Transition Rules
- Complete current phase documentation before proceeding
- Each phase must read previous phase documents
- Use `updateTodolist` only if needed; prefer `taskList` as execution status source

## Resuming Interrupted Workflows
When resuming an existing task:
1. Use `readTaskDocs` with phase `all` to restore context
2. Check `taskList.md` for pending items
3. Continue from the last incomplete task

====
