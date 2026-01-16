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
