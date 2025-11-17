# Design Document

## Overview

This design document outlines the technical approach for upgrading the message input system to support multi-session communication using Tiptap editor. The solution will enable users to direct messages to specific conversation sessions (main or sub-tasks) through a mention-based interface, while improving interrupt control for concurrent sessions.

The design maintains backward compatibility with existing WebSocket message routing while adding new capabilities for session targeting and cascading interrupts.

## Architecture

### High-Level Component Structure

```
ChatWindow (Main Session)
├── ConversationHistory
├── SessionSelector (NEW)
│   └── Active session indicator
├── TiptapMessageInput (UPGRADED from MessageInput)
│   ├── Tiptap Editor with Mention Extension
│   ├── Session Mention Dropdown
│   └── Smart Button (Send/Interrupt/Resume)
└── SubTaskRenderer (Multiple instances)
    └── Each with own WebSocketProvider context
```

### Data Flow

1. **Session Discovery**: WebSocketProvider tracks all active sessions (main + sub-tasks)
2. **User Input**: TiptapMessageInput captures text and session mentions
3. **Message Routing**: WebSocket sends message with target session ID
4. **Interrupt Cascade**: When interrupting with active sub-tasks:
   - Collect all active sub-task IDs
   - Send interrupt to each sub-task sequentially
   - Wait for acknowledgments
   - Finally interrupt main session

## Components and Interfaces

### 1. TiptapMessageInput Component (Replaces MessageInput)

**Purpose**: Rich text input with session mention support

**Key Features**:
- Tiptap editor with Mention extension
- `/` trigger for session selection dropdown
- Smart button state management (send/interrupt/resume)
- Keyboard shortcuts (Enter to send, Shift+Enter for newline)

**Props**:
```typescript
interface TiptapMessageInputProps {
  // No props needed - uses WebSocket context
}
```

**State**:
```typescript
interface TiptapMessageInputState {
  editor: Editor | null;
  buttonState: 'send' | 'interrupt' | 'resume';
  targetSessionId: string | null; // null = main session
  isInterrupting: boolean;
}
```

**Dependencies**:
- `@tiptap/react` - Core Tiptap React integration
- `@tiptap/starter-kit` - Basic editor functionality
- `@tiptap/extension-mention` - Mention/slash command support
- `@tiptap/extension-placeholder` - Placeholder text

### 2. SessionSelector Component (NEW)

**Purpose**: Visual indicator of currently selected target session

**Props**:
```typescript
interface SessionSelectorProps {
  selectedSessionId: string | null;
  availableSessions: SessionInfo[];
  onSessionChange: (sessionId: string | null) => void;
}

interface SessionInfo {
  id: string;
  type: 'main' | 'subtask';
  title: string;
  isActive: boolean;
}
```

**Rendering**:
- Displays above the input box
- Shows "Main Session" or sub-task title
- Dropdown to switch between sessions
- Visual distinction between main and sub-sessions

### 3. Enhanced WebSocketProvider

**New State**:
```typescript
interface WebSocketContextType {
  // ... existing fields
  activeSessions: SessionInfo[]; // NEW: Track all active sessions
  activeSubTaskIds: string[]; // NEW: Track running sub-tasks
  interruptAll: () => Promise<void>; // NEW: Cascade interrupt
}
```

**New Methods**:

```typescript
// Collect all active sessions
const getActiveSessions = (): SessionInfo[] => {
  const sessions: SessionInfo[] = [
    { id: taskId, type: 'main', title: 'Main Session', isActive: true }
  ];
  
  // Add sub-tasks from displayMessages
  displayMessages.forEach(msg => {
    if (msg.type === 'assignTask') {
      sessions.push({
        id: msg.data.taskId,
        type: 'subtask',
        title: msg.data.taskTarget,
        isActive: !msg.data.isCompleted
      });
    }
  });
  
  return sessions;
};

// Cascade interrupt: sub-tasks first, then main
const interruptAll = async (): Promise<void> => {
  const activeSubTasks = activeSubTaskIds.filter(id => id !== taskId);
  
  // Interrupt all sub-tasks
  for (const subTaskId of activeSubTasks) {
    await new Promise<void>((resolve) => {
      const unsubscribe = subscribe('ack', (data) => {
        if (data.taskId === subTaskId && data.type === 'interrupt') {
          unsubscribe();
          resolve();
        }
      });
      
      sendMessage({
        type: 'interrupt',
        data: { taskId: subTaskId, updateTime: Date.now() }
      });
      
      // Timeout after 3 seconds
      setTimeout(resolve, 3000);
    });
  }
  
  // Finally interrupt main session
  sendMessage({
    type: 'interrupt',
    data: { taskId, updateTime: Date.now() }
  });
};
```

### 4. Enhanced Message Routing

**Current Behavior**:
- Messages always go to current `taskId` in WebSocketProvider

**New Behavior**:
- Messages can specify target session via `targetSessionId`
- If `targetSessionId` is provided, route to that session
- Otherwise, default to current `taskId` (main session)

**Implementation**:
```typescript
const sendMessage = useCallback(<T extends USER_SEND_MESSAGE_NAME>(
  newMessage: WebSocketMessage<T>,
  targetSessionId?: string
) => {
  const effectiveTaskId = targetSessionId || taskId;
  
  const messageToSend = newMessage.type === "userSendMessage" 
    ? {
        ...newMessage,
        data: {
          ...newMessage.data,
          taskId: effectiveTaskId,
        }
      }
    : newMessage;

  // ... rest of existing logic
}, [socket, taskId, updateMessage]);
```

## Data Models

### Session Information

```typescript
interface SessionInfo {
  id: string;                    // Task ID
  type: 'main' | 'subtask';      // Session type
  title: string;                 // Display name
  isActive: boolean;             // Is currently running
  hasFollowupQuestion?: boolean; // Waiting for user input
}
```

### Tiptap Mention Node

```typescript
interface MentionNodeAttrs {
  id: string;        // Session ID
  label: string;     // Display text (e.g., "Main Session", "Task #1")
}
```

### Enhanced Message Data

```typescript
// Existing userSendMessage data
interface UserSendMessageData {
  message: string;
  taskId: string;
  updateTime: number;
  targetSessionId?: string; // NEW: Optional explicit target
}
```

## Error Handling

### Interrupt Failures

**Scenario**: Sub-task interrupt times out or fails

**Handling**:
- Log warning to console
- Continue with next sub-task
- Still attempt main session interrupt
- Show toast notification to user

### Invalid Session Target

**Scenario**: User mentions a session that no longer exists

**Handling**:
- Validate session ID before sending
- Fall back to main session
- Show warning toast
- Remove invalid mention from editor

### Tiptap Editor Initialization Failure

**Scenario**: Tiptap fails to initialize

**Handling**:
- Fall back to plain textarea (current implementation)
- Log error to console
- Show warning banner to user

## Testing Strategy

### Unit Tests

1. **TiptapMessageInput Component**
   - Editor initialization
   - Mention trigger and selection
   - Button state transitions
   - Keyboard shortcuts

2. **SessionSelector Component**
   - Session list rendering
   - Session switching
   - Visual state updates

3. **WebSocketProvider Enhancements**
   - Active session tracking
   - Cascade interrupt logic
   - Message routing with target session

### Integration Tests

1. **Multi-Session Communication**
   - Send message to main session
   - Send message to sub-task
   - Switch between sessions
   - Verify correct routing

2. **Interrupt Cascade**
   - Interrupt with no sub-tasks
   - Interrupt with one sub-task
   - Interrupt with multiple sub-tasks
   - Verify order and acknowledgments

3. **Followup Question Handling**
   - Custom text input during followup
   - Option selection during followup
   - Session auto-targeting for followup

### Manual Testing

1. **User Experience**
   - Mention dropdown responsiveness
   - Visual feedback clarity
   - Button state accuracy
   - Session selector usability

2. **Edge Cases**
   - Rapid session switching
   - Interrupt during message send
   - Multiple concurrent sub-tasks
   - Session completion during interaction

## Implementation Phases

### Phase 1: Tiptap Integration
- Install Tiptap dependencies
- Create basic TiptapMessageInput component
- Implement mention extension
- Maintain existing functionality

### Phase 2: Session Management
- Add SessionSelector component
- Track active sessions in WebSocketProvider
- Implement session switching logic
- Update message routing

### Phase 3: Interrupt Enhancement
- Implement cascade interrupt logic
- Update button state for sub-task awareness
- Add interrupt acknowledgment handling
- Test multi-session interrupts

### Phase 4: Followup Question Support
- Enable input during followup questions
- Auto-target session for followup responses
- Support both custom text and option selection
- Update askFollowupQuestion renderer

### Phase 5: Polish and Testing
- Add error handling
- Implement fallback mechanisms
- Write comprehensive tests
- Update documentation

## Dependencies

### New NPM Packages

```json
{
  "@tiptap/react": "^2.1.0",
  "@tiptap/starter-kit": "^2.1.0",
  "@tiptap/extension-mention": "^2.1.0",
  "@tiptap/extension-placeholder": "^2.1.0"
}
```

### Existing Dependencies (No Changes)
- React 18
- WebSocket (native)
- Tailwind CSS + DaisyUI
- Lucide React icons

## Migration Strategy

### Backward Compatibility

- Existing WebSocket message format unchanged
- `targetSessionId` is optional - defaults to current behavior
- Plain textarea fallback if Tiptap fails
- No server-side changes required

### Gradual Rollout

1. Deploy Tiptap input without session targeting (test editor stability)
2. Enable session selector (test UI/UX)
3. Enable cascade interrupts (test reliability)
4. Enable followup question input (test integration)

## Performance Considerations

### Tiptap Editor
- Lightweight configuration (only essential extensions)
- Debounce mention search (300ms)
- Lazy load mention dropdown

### Session Tracking
- Memoize active session list
- Update only on relevant message types
- Avoid unnecessary re-renders

### Interrupt Cascade
- Parallel interrupt requests (with Promise.all)
- Timeout protection (3s per sub-task)
- Cancel pending requests on unmount

## Security Considerations

### Session ID Validation
- Verify session exists before routing
- Prevent injection of arbitrary task IDs
- Sanitize user input in mentions

### XSS Prevention
- Tiptap handles HTML sanitization
- Escape session titles in dropdown
- Validate all user-provided data

## Accessibility

### Keyboard Navigation
- Tab to focus editor
- Arrow keys in mention dropdown
- Enter to select mention
- Escape to close dropdown

### Screen Reader Support
- ARIA labels for session selector
- Announce button state changes
- Describe active session
- Mention dropdown accessibility

## Visual Design

### Session Selector
```
┌─────────────────────────────────────┐
│ 📍 Target: Main Session        ▼   │
└─────────────────────────────────────┘
```

### Mention Dropdown
```
┌─────────────────────────────────────┐
│ / Select session...                 │
│ ┌─────────────────────────────────┐ │
│ │ 🏠 Main Session                 │ │
│ │ 📋 Task #1: Implement feature   │ │
│ │ 📋 Task #2: Write tests         │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Button States
- **Send**: Paper plane icon (blue)
- **Interrupt**: Stop icon (red) - shown when any session is active
- **Resume**: Play icon (green)
