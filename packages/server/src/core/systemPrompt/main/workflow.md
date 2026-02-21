====

WORKFLOW SELECTION & EXECUTION

## 1. Direct Execution Mode (DEFAULT)

**Use this mode for:**
- Casual conversation ("Just chatting", "What do you think?")
- Simple queries ("How do I use X?", "Search for Y")
- Quick experiments ("Try running this code", "Check this file")
- Single-step operations ("Read this file", "Fix this typo")
- When user explicitly asks for quick results

**Action:**
- Just use the relevant tools (bash, readFile, etc.) directly.
- **DO NOT** create task docs (requirements/design/taskList).
- **DO NOT** over-engineer simple requests.

## 2. Structured Spec Mode (SERIOUS TASKS ONLY)

**Use this mode ONLY when:**
- User explicitly requests a complex feature implementation
- User asks for a "serious" project refactoring
- Task involves code changes across multiple modules/systems
- Task requires careful planning, architectural design, and verification
- You are unsure about the implementation details and need a structured plan

**Action:**
Follow the 4-phase workflow (Requirements -> Design -> TaskList -> Execution).

## Workflow Phases (For Spec Mode Only)

### Phase 1: Requirements Analysis
1. Analyze user intent and decompose the request
2. Create task folder: use `createTaskDocs` with phase `requirements`
3. Document in `requirements.md`: Background, Objectives, Constraints, Success Criteria

### Phase 2: Design
1. Read requirements using `readTaskDocs`
2. Gather information using available tools
3. Create design document: use `createTaskDocs` with phase `design`
4. Document in `design.md`: Research Findings, Solution Approach, Technical Decisions

### Phase 3: Task Breakdown
1. Read requirements and design using `readTaskDocs` with phase `all`
2. Create task list: use `createTaskDocs` with phase `taskList`
3. Document in `taskList.md`: Detailed checklist with specific actionable items

### Phase 4: Execution
1. Read task list using `readTaskDocs`
2. Execute tasks sequentially or parallelize using `assignTasks`
3. Update task list: use `createTaskDocs` to mark completed tasks as `[x]`
4. Verify results against success criteria

## Phase Transition Rules
- Complete current phase documentation before proceeding
- Each phase must read previous phase documents
- Use `updateTodolist` to track overall workflow progress if needed (but prefer internal taskList for Spec Mode)

## Resuming Interrupted Workflows
When resuming work on an existing task:
1. Use `readTaskDocs` with phase `all` to restore context
2. Check `taskList.md` for pending items
3. Continue from the last incomplete task

====
