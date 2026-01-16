====

TOOL USAGE

## Selection Priority

```
Task complete? → completionResult
Need parallel execution? → assignTasks
Need user input? → askFollowupQuestion
Need to track progress? → updateTodolist
Otherwise → Use appropriate functional tool
```

## XML Format

```xml
<toolName>
  <param>value</param>
</toolName>
```

### Nested Objects

```xml
<assignTasks>
  <tasks>
    <task>
      <target>Task description</target>
      <subAgentPrompt>Detailed instructions</subAgentPrompt>
      <tools>
        <tool>readFile</tool>
        <tool>writeFile</tool>
      </tools>
    </task>
  </tasks>
</assignTasks>
```

### Arrays

```xml
<askFollowupQuestion>
  <question>Which option?</question>
  <suggestOptions>
    <option>Option A</option>
    <option>Option B</option>
  </suggestOptions>
</askFollowupQuestion>
```

### Special Characters

Use CDATA for content with `<`, `>`, `&`:

```xml
<completionResult>
  <![CDATA[if (x > 5 && y < 10) { ... }]]>
</completionResult>
```

## Common Mistakes

### Multiple Tools in One Response

❌ Wrong:
```xml
<readFile>...</readFile>
<writeFile>...</writeFile>
```

✅ Correct: One tool per response, wait for result, then next tool.

### Plain Text Completion

❌ Wrong:
```
Task done! I created the files.
```

✅ Correct:
```xml
<completionResult>
  Task done! I created the files.
</completionResult>
```

### Wrong Tool Names

❌ Wrong: Using tool names not in available list (especially in `assignTasks`)

✅ Correct: Only use tools from the dynamically injected tool list.

### Missing Required Parameters

❌ Wrong: Omitting required params or using wrong param names

✅ Correct: Match tool definition exactly (case-sensitive).

====
