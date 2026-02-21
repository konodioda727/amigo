# Design Document: Frontend SDK

## Overview

This design restructures the Amigo frontend package to function as an SDK with clear separation between reusable SDK exports and a demo application. The SDK provides a flexible, type-safe way for developers to integrate AI agent orchestration into their React applications with customizable message rendering.

The architecture follows a provider pattern where `WebSocketProvider` manages connection state and message handling, while hooks and components provide access to functionality. Developers can use default renderers or provide custom implementations that conform to TypeScript interfaces.

## Architecture

### Package Structure

```
packages/frontend/
├── src/
│   ├── sdk/                    # SDK exports (public API)
│   │   ├── index.ts            # Main SDK entry point
│   │   ├── provider/           # WebSocketProvider
│   │   ├── hooks/              # React hooks
│   │   ├── components/         # Reusable components
│   │   ├── types/              # Public type definitions
│   │   ├── context/            # React contexts
│   │   └── store/              # Zustand store (internal)
│   ├── components/             # Demo app components
│   ├── App.tsx                 # Demo app root
│   ├── main.tsx                # Demo app entry
│   └── index.css               # Demo app styles
├── package.json                # Defines SDK exports
└── tsconfig.json
```

### Export Strategy

**package.json configuration:**
```json
{
  "name": "@amigo-llm/frontend",
  "main": "./dist/sdk/index.js",
  "types": "./dist/sdk/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/sdk/index.js",
      "types": "./dist/sdk/index.d.ts"
    },
    "./styles": "./dist/index.css"
  }
}
```

**SDK exports (src/sdk/index.ts):**
```typescript
// Provider
export { WebSocketProvider } from './provider/WebSocketProvider';
export type { WebSocketProviderProps } from './provider/WebSocketProvider';

// Hooks
export { useWebSocket } from './hooks/useWebSocket';
export { useMessages } from './hooks/useMessages';
export { useConnection } from './hooks/useConnection';
export { useTasks } from './hooks/useTasks';
export { useMentions } from './hooks/useMentions';
export { useSendMessage } from './hooks/useSendMessage';

// Components
export { ChatWindow } from './components/ChatWindow';
export { MessageInput } from './components/MessageInput';
export { ConversationHistory } from './components/ConversationHistory';
export { TaskRenderer } from './components/TaskRenderer';

// Types
export type * from './types';

// Renderers
export { defaultRenderers } from './components/renderers';
export type { MessageRendererMap, MessageRendererProps } from './types/renderers';
```

## Components and Interfaces

### 1. WebSocketProvider

**Purpose:** Central provider that manages WebSocket connection, state, and message handling.

**Interface:**
```typescript
interface WebSocketProviderProps {
  // Connection configuration
  url?: string;
  autoConnect?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;
  
  // Event handlers
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (message: WebSocketMessage<any>) => void;
  
  // Custom renderers
  renderers?: Partial<MessageRendererMap>;
  
  // Children
  children: React.ReactNode;
}

export function WebSocketProvider(props: WebSocketProviderProps): JSX.Element;
```

**Implementation Details:**
- Wraps Zustand store creation
- Initializes WebSocket connection based on props
- Provides context for all child components
- Merges custom renderers with defaults
- Handles connection lifecycle

### 2. Core Hooks

#### useWebSocket
```typescript
interface UseWebSocketReturn {
  // Connection state
  status: ConnectionStatus;
  isConnected: boolean;
  
  // Connection methods
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  
  // Message methods
  send: <T extends USER_SEND_MESSAGE_NAME>(
    taskId: string,
    message: WebSocketMessage<T>
  ) => void;
  
  // Event subscription
  subscribe: <T extends SERVER_SEND_MESSAGE_NAME>(
    type: T,
    listener: (data: ServerSendMessageData<T>) => void
  ) => () => void;
}

export function useWebSocket(): UseWebSocketReturn;
```

#### useMessages
```typescript
interface UseMessagesReturn {
  // Messages for current task
  messages: DisplayMessageType[];
  rawMessages: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>[];
  
  // Message operations
  sendMessage: (message: string) => void;
  clearMessages: () => void;
}

export function useMessages(taskId?: string): UseMessagesReturn;
```

#### useConnection
```typescript
interface UseConnectionReturn {
  status: ConnectionStatus;
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnected: boolean;
  error: Error | null;
}

export function useConnection(): UseConnectionReturn;
```

#### useTasks
```typescript
interface UseTasksReturn {
  // Task data
  tasks: Record<string, TaskState>;
  currentTaskId: string | null;
  mainTaskId: string | null;
  
  // Task operations
  switchTask: (taskId: string) => void;
  getTaskHierarchy: (taskId: string) => TaskHierarchy;
  getTaskStatus: (taskId: string) => TaskStatus;
}

export function useTasks(): UseTasksReturn;
```

#### useMentions
```typescript
interface UseMentionsReturn {
  // Available mentions
  mentions: MentionItem[];
  
  // Mention operations
  getMentionSuggestions: (query: string) => MentionItem[];
  
  // Followup queue
  followupQueue: string[];
  pendingMention: string | null;
}

export function useMentions(): UseMentionsReturn;
```

#### useSendMessage
```typescript
interface UseSendMessageReturn {
  sendMessage: (message: string, taskId?: string) => void;
  sendInterrupt: (taskId?: string) => void;
  sendResume: (taskId?: string) => void;
  sendLoadTask: (taskId: string) => void;
}

export function useSendMessage(): UseSendMessageReturn;
```

### 3. Message Renderer System

**Renderer Type Definitions:**
```typescript
// Base renderer props for each message type
export interface MessageRendererProps<T extends DisplayMessageType> {
  message: T;
  taskId: string;
  isLatest: boolean;
}

// Specific renderer prop types
export type CommonMessageRendererProps = MessageRendererProps<FrontendCommonMessageType>;
export type ToolMessageRendererProps<T extends ToolNames> = MessageRendererProps<FrontendToolMessageType<T>>;
export type UserMessageRendererProps = MessageRendererProps<UserSendMessageDisplayType>;
export type CompletionResultRendererProps = MessageRendererProps<CompletionResultType>;
export type AskFollowupQuestionRendererProps = MessageRendererProps<AskFollowupQuestionType>;
export type InterruptRendererProps = MessageRendererProps<InterruptDisplayType>;
export type ErrorRendererProps = MessageRendererProps<ErrorDisplayType>;
export type AlertRendererProps = MessageRendererProps<AlertDisplayType>;

// Renderer function type
export type MessageRenderer<T extends DisplayMessageType> = (
  props: MessageRendererProps<T>
) => React.ReactNode;

// Complete renderer map
export interface MessageRendererMap {
  message: MessageRenderer<FrontendCommonMessageType>;
  tool: MessageRenderer<FrontendToolMessageType<any>>;
  userSendMessage: MessageRenderer<UserSendMessageDisplayType>;
  completionResult: MessageRenderer<CompletionResultType>;
  askFollowupQuestion: MessageRenderer<AskFollowupQuestionType>;
  interrupt: MessageRenderer<InterruptDisplayType>;
  error: MessageRenderer<ErrorDisplayType>;
  alert: MessageRenderer<AlertDisplayType>;
  assignTaskUpdated: MessageRenderer<AssignTaskUpdatedDisplayType>;
}
```

**Default Renderers:**
```typescript
// src/sdk/components/renderers/index.tsx
export const defaultRenderers: MessageRendererMap = {
  message: (props) => <DefaultMessageRenderer {...props} />,
  tool: (props) => <DefaultToolRenderer {...props} />,
  userSendMessage: (props) => <DefaultUserMessageRenderer {...props} />,
  completionResult: (props) => <DefaultCompletionResultRenderer {...props} />,
  askFollowupQuestion: (props) => <DefaultAskFollowupQuestionRenderer {...props} />,
  interrupt: (props) => <DefaultInterruptRenderer {...props} />,
  error: (props) => <DefaultErrorRenderer {...props} />,
  alert: (props) => <DefaultAlertRenderer {...props} />,
  assignTaskUpdated: (props) => <DefaultAssignTaskUpdatedRenderer {...props} />,
};
```

**Renderer Resolution:**
```typescript
// src/sdk/hooks/useRenderer.ts
export function useRenderer<T extends DisplayMessageType['type']>(
  type: T
): MessageRenderer<Extract<DisplayMessageType, { type: T }>> {
  const context = useWebSocketContext();
  const customRenderer = context.renderers?.[type];
  const defaultRenderer = defaultRenderers[type];
  
  return customRenderer || defaultRenderer;
}
```

### 4. Reusable Components

#### ChatWindow
```typescript
interface ChatWindowProps {
  taskId?: string;
  className?: string;
  showHeader?: boolean;
  headerContent?: React.ReactNode;
}

export function ChatWindow(props: ChatWindowProps): JSX.Element;
```

#### MessageInput
```typescript
interface MessageInputProps {
  taskId?: string;
  className?: string;
  placeholder?: string;
  onSend?: (message: string) => void;
  disabled?: boolean;
  showMentions?: boolean;
}

export function MessageInput(props: MessageInputProps): JSX.Element;
```

#### ConversationHistory
```typescript
interface ConversationHistoryProps {
  className?: string;
  onSelectConversation?: (taskId: string) => void;
}

export function ConversationHistory(props: ConversationHistoryProps): JSX.Element;
```

#### TaskRenderer
```typescript
interface TaskRendererProps {
  taskId: string;
  showChildren?: boolean;
  depth?: number;
  className?: string;
}

export function TaskRenderer(props: TaskRendererProps): JSX.Element;
```

## Data Models

### WebSocket Store Structure

```typescript
interface WebSocketStore {
  // Connection state
  socket: WebSocket | null;
  connectionStatus: ConnectionStatus;
  
  // Task state
  tasks: Record<string, TaskState>;
  mainTaskId: string | null;
  currentTaskId: string | null;
  
  // Mention state
  followupQueue: string[];
  pendingMention: string | null;
  
  // Message listeners
  listeners: Record<string, Set<Listener<any>>>;
  
  // Methods
  connect: () => void;
  disconnect: () => void;
  sendMessage: <T extends USER_SEND_MESSAGE_NAME>(
    taskId: string,
    message: WebSocketMessage<T>
  ) => void;
  processMessage: (message: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>) => void;
  subscribe: <T extends SERVER_SEND_MESSAGE_NAME>(
    type: T,
    listener: Listener<T>
  ) => Unsubscribe;
  registerTask: (taskId: string, parentTaskId?: string) => void;
  // ... other methods
}

interface TaskState {
  taskId: string;
  parentTaskId?: string;
  rawMessages: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>[];
  displayMessages: DisplayMessageType[];
  lastUpdateTime: number;
  status: TaskStatus;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";
type TaskStatus = "active" | "completed" | "interrupted" | "error";
```

### Context Structure

```typescript
interface WebSocketContextValue {
  // Store access
  store: WebSocketStore;
  
  // Configuration
  config: {
    url: string;
    autoConnect: boolean;
    reconnect: boolean;
    reconnectInterval: number;
    reconnectAttempts: number;
  };
  
  // Custom renderers
  renderers?: Partial<MessageRendererMap>;
  
  // Event handlers
  handlers: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
    onMessage?: (message: WebSocketMessage<any>) => void;
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Provider Initialization
*For any* WebSocketProvider configuration, when the provider mounts, it should initialize the Zustand store and establish a WebSocket connection if autoConnect is true.
**Validates: Requirements 2.2, 2.3**

### Property 2: Hook Context Dependency
*For any* SDK hook (useMessages, useConnection, useTasks, etc.), calling the hook outside of a WebSocketProvider should throw a descriptive error.
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

### Property 3: Renderer Type Safety
*For any* custom renderer provided to WebSocketProvider, TypeScript should enforce that the renderer function signature matches the expected MessageRenderer type for that message type.
**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 4: Renderer Fallback
*For any* message type, if no custom renderer is provided, the SDK should use the default renderer for that message type.
**Validates: Requirements 4.4, 7.2**

### Property 5: Message Processing Order
*For any* sequence of WebSocket messages, the SDK should process and display them in the order they were received, maintaining message threading relationships.
**Validates: Requirements 8.3**

### Property 6: Connection State Consistency
*For any* connection state transition (connecting → connected, connected → disconnected, etc.), the useConnection hook should reflect the updated state and trigger re-renders of dependent components.
**Validates: Requirements 2.4, 3.2**

### Property 7: Task Hierarchy Integrity
*For any* task with subtasks, the task hierarchy returned by useTasks should correctly represent parent-child relationships and maintain referential integrity.
**Validates: Requirements 3.3**

### Property 8: Message Subscription Cleanup
*For any* message subscription created via subscribe(), calling the returned unsubscribe function should remove the listener and prevent future notifications.
**Validates: Requirements 2.7**

### Property 9: Demo App SDK Isolation
*For any* import in the demo application (src/App.tsx, src/main.tsx, src/components/), it should only import from SDK exports (src/sdk/*) or local demo files, never from internal SDK implementation details.
**Validates: Requirements 10.2**

### Property 10: Renderer Props Completeness
*For any* message renderer, the props passed to the renderer should include the complete message data, taskId, and isLatest flag as specified in MessageRendererProps.
**Validates: Requirements 4.5**

## Error Handling

### Connection Errors
- WebSocket connection failures trigger onError callback
- Automatic reconnection with exponential backoff (if enabled)
- Connection status reflects error state
- User-friendly error messages via toast notifications

### Message Parsing Errors
- Invalid JSON messages logged to console
- Zod validation failures for message schemas
- Graceful degradation - invalid messages don't crash the app
- Error messages displayed in UI via ErrorRenderer

### Renderer Errors
- React Error Boundaries catch renderer exceptions
- Fallback UI displayed for failed renderers
- Errors logged with message type and data
- Application continues functioning

### Hook Usage Errors
- Descriptive error when hooks used outside provider
- TypeScript compile-time errors for type mismatches
- Runtime validation for required props

## Testing Strategy

### Unit Tests
- Test individual hooks in isolation with mock provider
- Test renderer components with sample message data
- Test WebSocketProvider initialization and cleanup
- Test message combiner logic
- Test connection state transitions

### Property-Based Tests
- Property 1: Test provider initialization with random configurations
- Property 2: Test hook context dependency with various hook combinations
- Property 3: Verify renderer type safety (compile-time, tested via tsc)
- Property 4: Test renderer fallback with random message types
- Property 5: Test message ordering with random message sequences
- Property 6: Test connection state consistency with random state transitions
- Property 7: Test task hierarchy with random task trees
- Property 8: Test subscription cleanup with random subscribe/unsubscribe patterns
- Property 9: Verify demo app imports (static analysis via custom script)
- Property 10: Test renderer props with random message data

### Integration Tests
- Test complete SDK usage flow: Provider → Hooks → Components → Renderers
- Test WebSocket message flow end-to-end
- Test custom renderer integration
- Test demo application functionality

### Testing Configuration
- Use Bun test runner
- Use fast-check for property-based testing
- Minimum 100 iterations per property test
- Tag each property test with: **Feature: frontend-sdk, Property {number}: {property_text}**

## Implementation Notes

### Migration Strategy
1. Create SDK structure under src/sdk/
2. Move and refactor store to src/sdk/store/
3. Create WebSocketProvider in src/sdk/provider/
4. Create hooks in src/sdk/hooks/
5. Move and adapt components to src/sdk/components/
6. Create type definitions in src/sdk/types/
7. Update demo app to use SDK exports only
8. Update package.json exports
9. Write tests
10. Update documentation

### Backward Compatibility
- Existing demo app maintains all functionality
- No breaking changes to WebSocket message protocol
- Store structure remains compatible with existing message handlers

### Performance Considerations
- Zustand provides efficient re-renders (only affected components update)
- Message combiner runs only when new messages arrive
- Renderer memoization to prevent unnecessary re-renders
- Tree-shaking support for minimal bundle size

### Developer Experience
- Clear TypeScript types for all public APIs
- Comprehensive JSDoc comments
- Example code in documentation
- Demo app serves as living documentation
- Helpful error messages for common mistakes
