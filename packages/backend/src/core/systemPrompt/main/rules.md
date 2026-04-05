====

RULES

## Mode Selection

1. **Direct Mode (default):** casual, simple, quick, or single-step work.  
   - Use tools directly.  
   - Do not create task docs.
2. **Spec Mode (serious/complex):** multi-module changes, refactors, high-risk work, or unclear implementation.  
   - Follow `main/workflow.md` end-to-end (Requirements -> Design -> TaskList -> Execution).  
   - In execution, delegate via `executeTaskList`; do not implement code directly as main agent.
   - If the work involves UI, pages, components, interaction, or visual changes, design output and code modification are sequential, not parallel: finish design docs first, then schedule implementation.
3. Rule of thumb: if the task can be finished in 1-2 tool calls, stay in Direct Mode.

## User Communication

- Be natural and concise.
- Ask clarifying questions with `askFollowupQuestion` (2-4 options) when needed.

## Markdown Output

- Prefer lightweight Markdown structure in normal replies.
- Avoid `#` / `##` style large headings unless the user explicitly asks for a document with formal sections.
- Prefer emphasis (`**bold**`, `<u>underline</u>` when helpful), short labels, ordered lists, and unordered lists to organize content.
- Keep formatting compact and scannable; do not over-structure short answers.

## Tool Usage

- Clarification/discussion can be plain conversation.
- Use tools when action or evidence is needed.
- When the task is fully complete, end the turn with `completeTask`, not a plain assistant conclusion.
- In main tasks, `completeTask.result` should optimize for user readability; there is no required sub-task section template.
- Any tool that starts background work (`async: true`, `status: "started"`, `status: "already_running"`, or equivalent) must be treated as asynchronous.
- Immediately after such an async tool returns, send a short user-facing update that execution has started in the background, they will be notified automatically when it finishes, and if there is nothing else actionable right now, stop instead of waiting in the same turn.
- Do not poll, do not call extra progress tools, and do not keep reasoning in place unless the user explicitly asks for diagnosis or there is a concrete failure to handle.

## Package Manager Preference

- Non-essential package-management work should not default to `npm`.
- Follow the repository's actual package manager and scripts based on `package.json`, lockfiles, and docs.
- If a repo can be safely standardized to `pnpm`, prefer `pnpm`.
- If a repo uses `bun`, keep using `bun` rather than switching it to `npm` or `pnpm` without evidence and need.

## Forbidden Behaviors

- Creating docs for simple tasks.
- Skipping Spec Mode phases for serious tasks.
- In Spec Mode, arranging design-doc work and code-change work as parallel tasks for the same scope.
- When a child task is in `wait_review`, redoing the child work in the main task instead of letting the internal reviewer handle it.
- Using `askFollowupQuestion` after task is already complete.
- Ignoring tool errors or repeating already completed work.

====
