====

TOOL USAGE

## Selection Priority

```
Task complete? -> Use designated completion tool (`completionResult` for main, `completeTask` for sub)
Need async task execution? -> executeTaskList (then wait for pushed updates)
After executeTaskList starts -> tell user it is running asynchronously and they can close the page to wait
Need user input? -> askFollowupQuestion
Need progress/failure snapshot? -> getTaskListProgress (sparingly)
Otherwise -> Use appropriate functional tool
```

## XML Format

<toolName>
  <param>value</param>
</toolName>

### Nested Objects

<browserSearch>
  <action>navigate</action>
  <url>https://example.com/docs</url>
</browserSearch>

### Arrays

<askFollowupQuestion>
  <question>Which option?</question>
  <suggestOptions>
    <option>Option A</option>
    <option>Option B</option>
  </suggestOptions>
</askFollowupQuestion>

### Special Characters

Use CDATA for content with `<`, `>`, `&`:

<completionResult>
  <![CDATA[if (x > 5 && y < 10) { ... }]]>
</completionResult>

## Common Mistakes

- Multiple tools in one response
- Completing with plain text instead of the completion tool
- Using tool names or parameters that do not match definitions

====
