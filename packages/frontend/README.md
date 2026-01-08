# @amigo-llm/frontend

A React SDK for building AI agent orchestration interfaces with WebSocket-based real-time communication, customizable message rendering, and hierarchical task management.

## Features

- 🔌 **WebSocket Provider** - Centralized connection and state management
- 🎣 **React Hooks** - Access messages, tasks, and connection state
- 🎨 **Customizable Renderers** - Override default message rendering with your own components
- 🧩 **Pre-built Components** - ChatWindow, MessageInput, ConversationHistory, and more
- 📦 **Type-Safe** - Full TypeScript support with strict type checking
- ⚡ **Performance** - Efficient re-renders with Zustand state management
- 🌳 **Tree-Shakeable** - Import only what you need

## Installation

```bash
# Using pnpm
pnpm add @amigo-llm/frontend

# Using npm
npm install @amigo-llm/frontend

# Using yarn
yarn add @amigo-llm/frontend

# Using bun
bun add @amigo-llm/frontend
```

### Peer Dependencies

This package requires React 18 or higher:

```bash
pnpm add react react-dom
```

### Styles

Import the SDK styles in your application:

```typescript
import '@amigo-llm/frontend/styles';
```

## Quick Start

Here's a minimal example to get you started:

```tsx
import {
  WebSocketProvider,
  ChatWindow,
  MessageInput,
} from '@amigo-llm/frontend';
import '@amigo-llm/frontend/styles';

function App() {
  return (
    <WebSocketProvider
      url="ws://localhost:10013"
      autoConnect={true}
    >
      <div className="flex flex-col h-screen">
        <ChatWindow className="flex-1" />
        <MessageInput placeholder="Type a message..." />
      </div>
    </WebSocketProvider>
  );
}

export default App;
```

## Core Concepts

### WebSocketProvider

The `WebSocketProvider` is the root component that manages the WebSocket connection and provides context to all child components.

```tsx
import { WebSocketProvider } from '@amigo-llm/frontend';

<WebSocketProvider
  url="ws://localhost:10013"
  autoConnect={true}
  reconnect={true}
  reconnectInterval={3000}
  reconnectAttempts={5}
  onConnect={() => console.log('Connected')}
  onDisconnect={() => console.log('Disconnected')}
  onError={(error) => console.error('Error:', error)}
  onMessage={(message) => console.log('Message:', message)}
  renderers={{
    message: CustomMessageRenderer,
    tool: CustomToolRenderer,
  }}
>
  {/* Your app components */}
</WebSocketProvider>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `url` | `string` | - | WebSocket server URL |
| `autoConnect` | `boolean` | `true` | Automatically connect on mount |
| `reconnect` | `boolean` | `true` | Enable automatic reconnection |
| `reconnectInterval` | `number` | `3000` | Milliseconds between reconnection attempts |
| `reconnectAttempts` | `number` | `5` | Maximum reconnection attempts |
| `onConnect` | `() => void` | - | Called when connection is established |
| `onDisconnect` | `() => void` | - | Called when connection is closed |
| `onError` | `(error: Error) => void` | - | Called on connection errors |
| `onMessage` | `(message: any) => void` | - | Called on every received message |
| `renderers` | `Partial<MessageRendererMap>` | - | Custom message renderers |
| `children` | `ReactNode` | - | Child components |

### Hooks

The SDK provides several hooks to access state and functionality:

#### useConnection

Access connection state and status:

```tsx
import { useConnection } from '@amigo-llm/frontend';

function ConnectionStatus() {
  const { status, isConnected, isConnecting, isDisconnected, error } = useConnection();
  
  return (
    <div>
      Status: {status}
      {error && <p>Error: {error.message}</p>}
    </div>
  );
}
```

#### useMessages

Access messages for the current or specific task:

```tsx
import { useMessages } from '@amigo-llm/frontend';

function MessageList({ taskId }) {
  const { messages, rawMessages, sendMessage, clearMessages } = useMessages(taskId);
  
  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>{msg.content}</div>
      ))}
      <button onClick={() => sendMessage('Hello!')}>Send</button>
      <button onClick={clearMessages}>Clear</button>
    </div>
  );
}
```

#### useTasks

Access task hierarchy and status:

```tsx
import { useTasks } from '@amigo-llm/frontend';

function TaskList() {
  const {
    tasks,
    currentTaskId,
    mainTaskId,
    switchTask,
    getTaskHierarchy,
    getTaskStatus,
  } = useTasks();
  
  return (
    <div>
      {Object.values(tasks).map(task => (
        <div key={task.taskId} onClick={() => switchTask(task.taskId)}>
          {task.taskId} - {getTaskStatus(task.taskId)}
        </div>
      ))}
    </div>
  );
}
```

#### useSendMessage

Send different types of messages:

```tsx
import { useSendMessage } from '@amigo-llm/frontend';

function Controls() {
  const { sendMessage, sendInterrupt, sendResume, sendLoadTask } = useSendMessage();
  
  return (
    <div>
      <button onClick={() => sendMessage('Hello')}>Send Message</button>
      <button onClick={() => sendInterrupt()}>Interrupt</button>
      <button onClick={() => sendResume()}>Resume</button>
      <button onClick={() => sendLoadTask('task-123')}>Load Task</button>
    </div>
  );
}
```

#### useMentions

Access mention suggestions and followup queue:

```tsx
import { useMentions } from '@amigo-llm/frontend';

function MentionSuggestions() {
  const { mentions, getMentionSuggestions, followupQueue, pendingMention } = useMentions();
  
  const suggestions = getMentionSuggestions('search query');
  
  return (
    <div>
      {suggestions.map(mention => (
        <div key={mention.id}>{mention.label}</div>
      ))}
    </div>
  );
}
```

#### useWebSocket

Low-level access to WebSocket functionality:

```tsx
import { useWebSocket } from '@amigo-llm/frontend';

function WebSocketControls() {
  const { status, isConnected, connect, disconnect, reconnect, send, subscribe } = useWebSocket();
  
  // Subscribe to specific message types
  useEffect(() => {
    const unsubscribe = subscribe('tool', (data) => {
      console.log('Tool message:', data);
    });
    
    return unsubscribe;
  }, [subscribe]);
  
  return (
    <div>
      <button onClick={connect}>Connect</button>
      <button onClick={disconnect}>Disconnect</button>
      <button onClick={reconnect}>Reconnect</button>
    </div>
  );
}
```

### Components

#### ChatWindow

A complete chat interface with message rendering:

```tsx
import { ChatWindow } from '@amigo-llm/frontend';

<ChatWindow
  taskId="optional-task-id"
  className="h-full"
  showHeader={true}
  headerContent={<CustomHeader />}
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `taskId` | `string` | Current task | Task ID to display messages for |
| `className` | `string` | - | CSS class name |
| `showHeader` | `boolean` | `false` | Show header section |
| `headerContent` | `ReactNode` | - | Custom header content |

#### MessageInput

An input field with mention support:

```tsx
import { MessageInput } from '@amigo-llm/frontend';

<MessageInput
  taskId="optional-task-id"
  className="border-t"
  placeholder="Type a message..."
  onSend={(message) => console.log('Sent:', message)}
  disabled={false}
  showMentions={true}
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `taskId` | `string` | Current task | Task ID to send messages to |
| `className` | `string` | - | CSS class name |
| `placeholder` | `string` | - | Input placeholder text |
| `onSend` | `(message: string) => void` | - | Called when message is sent |
| `disabled` | `boolean` | `false` | Disable input |
| `showMentions` | `boolean` | `true` | Enable mention suggestions |

#### ConversationHistory

Display a list of conversations:

```tsx
import { ConversationHistory } from '@amigo-llm/frontend';

<ConversationHistory
  className="w-64"
  onSelectConversation={(taskId) => console.log('Selected:', taskId)}
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | - | CSS class name |
| `onSelectConversation` | `(taskId: string) => void` | - | Called when conversation is selected |

#### TaskRenderer

Render task hierarchy recursively:

```tsx
import { TaskRenderer } from '@amigo-llm/frontend';

<TaskRenderer
  taskId="task-123"
  showChildren={true}
  depth={0}
  className="p-4"
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `taskId` | `string` | - | Task ID to render |
| `showChildren` | `boolean` | `true` | Show child tasks |
| `depth` | `number` | `0` | Current nesting depth |
| `className` | `string` | - | CSS class name |

## Custom Renderers

You can customize how messages are displayed by providing custom renderers.

### Renderer Interface

All renderers follow this interface:

```typescript
type MessageRenderer<T extends DisplayMessageType> = (
  props: MessageRendererProps<T>
) => React.ReactNode;

interface MessageRendererProps<T> {
  message: T;
  taskId: string;
  isLatest: boolean;
}
```

### Example: Custom Message Renderer

```tsx
import type { CommonMessageRendererProps } from '@amigo-llm/frontend';

function CustomMessageRenderer({ message, taskId, isLatest }: CommonMessageRendererProps) {
  return (
    <div className={`message ${isLatest ? 'latest' : ''}`}>
      <div className="content">{message.data.content}</div>
      <div className="meta">Task: {taskId}</div>
    </div>
  );
}

// Use it in WebSocketProvider
<WebSocketProvider
  url="ws://localhost:10013"
  renderers={{
    message: CustomMessageRenderer,
  }}
>
  {/* ... */}
</WebSocketProvider>
```

### Example: Custom Tool Renderer

```tsx
import type { ToolMessageRendererProps } from '@amigo-llm/frontend';

function CustomToolRenderer({ message, taskId, isLatest }: ToolMessageRendererProps<any>) {
  const { toolName, params, result } = message.data;
  
  return (
    <div className="tool-message">
      <h3>Tool: {toolName}</h3>
      <pre>Params: {JSON.stringify(params, null, 2)}</pre>
      {result && <pre>Result: {JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
```

### Available Renderer Types

You can customize renderers for these message types:

- `message` - Regular assistant messages
- `tool` - Tool execution messages
- `userSendMessage` - User messages
- `completionResult` - Task completion messages
- `askFollowupQuestion` - Followup question prompts
- `interrupt` - Interrupt notifications
- `error` - Error messages
- `alert` - Alert notifications
- `assignTaskUpdated` - Task assignment updates

### Using Default Renderers

You can import and extend default renderers:

```tsx
import {
  defaultRenderers,
  DefaultMessageRenderer,
  DefaultToolRenderer,
} from '@amigo-llm/frontend';

// Use all defaults
<WebSocketProvider renderers={defaultRenderers}>

// Mix custom and default
<WebSocketProvider
  renderers={{
    message: CustomMessageRenderer,
    tool: DefaultToolRenderer, // Use default for tools
  }}
>
```

### Per-Component Renderer Override

You can also override renderers at the component level using the `useRenderer` hook:

```tsx
import { useRenderer } from '@amigo-llm/frontend';

function CustomChatWindow() {
  const renderMessage = useRenderer('message');
  const { messages } = useMessages();
  
  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          {msg.type === 'message' ? (
            <CustomMessageRenderer message={msg} taskId="..." isLatest={false} />
          ) : (
            renderMessage({ message: msg, taskId: "...", isLatest: false })
          )}
        </div>
      ))}
    </div>
  );
}
```

## Advanced Usage

### Accessing WebSocket Context

For advanced use cases, you can access the WebSocket context directly:

```tsx
import { useWebSocketContext } from '@amigo-llm/frontend';

function AdvancedComponent() {
  const context = useWebSocketContext();
  
  // Access store directly
  const store = context.store;
  
  // Access configuration
  const config = context.config;
  
  // Access custom renderers
  const renderers = context.renderers;
  
  return <div>...</div>;
}
```

### Type Exports

The SDK exports all TypeScript types for your convenience:

```typescript
import type {
  // Provider types
  WebSocketProviderProps,
  
  // Hook return types
  UseWebSocketReturn,
  UseConnectionReturn,
  UseMessagesReturn,
  UseTasksReturn,
  UseMentionsReturn,
  UseSendMessageReturn,
  
  // Component props
  ChatWindowProps,
  MessageInputProps,
  ConversationHistoryProps,
  TaskRendererProps,
  
  // Renderer types
  MessageRendererMap,
  MessageRendererProps,
  MessageRenderer,
  CommonMessageRendererProps,
  ToolMessageRendererProps,
  UserMessageRendererProps,
  CompletionResultRendererProps,
  AskFollowupQuestionRendererProps,
  InterruptRendererProps,
  ErrorRendererProps,
  AlertRendererProps,
  
  // Store types
  WebSocketStore,
  TaskState,
  ConnectionStatus,
  
  // Context types
  WebSocketContextValue,
} from '@amigo-llm/frontend';
```

### Error Handling

The SDK provides error handling through the `onError` callback and connection state:

```tsx
function App() {
  const [error, setError] = useState<Error | null>(null);
  
  return (
    <WebSocketProvider
      url="ws://localhost:10013"
      onError={(err) => {
        console.error('WebSocket error:', err);
        setError(err);
      }}
      onDisconnect={() => {
        console.log('Disconnected from server');
      }}
    >
      {error && (
        <div className="error-banner">
          Error: {error.message}
        </div>
      )}
      <ChatWindow />
    </WebSocketProvider>
  );
}
```

### Connection Management

Control the connection lifecycle:

```tsx
function ConnectionManager() {
  const { status, connect, disconnect, reconnect } = useWebSocket();
  
  return (
    <div>
      <p>Status: {status}</p>
      {status === 'disconnected' && (
        <button onClick={connect}>Connect</button>
      )}
      {status === 'connected' && (
        <button onClick={disconnect}>Disconnect</button>
      )}
      {status === 'error' && (
        <button onClick={reconnect}>Retry</button>
      )}
    </div>
  );
}
```

## Complete Example

Here's a complete example with custom styling and renderers:

```tsx
import { useState } from 'react';
import {
  WebSocketProvider,
  ChatWindow,
  MessageInput,
  ConversationHistory,
  useConnection,
  useTasks,
  type CommonMessageRendererProps,
} from '@amigo-llm/frontend';
import '@amigo-llm/frontend/styles';
import './app.css';

// Custom message renderer
function CustomMessageRenderer({ message, isLatest }: CommonMessageRendererProps) {
  return (
    <div className={`custom-message ${isLatest ? 'latest' : ''}`}>
      <div className="avatar">AI</div>
      <div className="content">
        {message.data.content}
      </div>
      <div className="timestamp">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}

// Connection status indicator
function ConnectionIndicator() {
  const { status, isConnected } = useConnection();
  
  return (
    <div className={`status-indicator ${status}`}>
      <span className={`dot ${isConnected ? 'connected' : 'disconnected'}`} />
      {status}
    </div>
  );
}

// Task switcher
function TaskSwitcher() {
  const { tasks, currentTaskId, switchTask } = useTasks();
  
  return (
    <select
      value={currentTaskId || ''}
      onChange={(e) => switchTask(e.target.value)}
    >
      {Object.values(tasks).map(task => (
        <option key={task.taskId} value={task.taskId}>
          {task.taskId}
        </option>
      ))}
    </select>
  );
}

// Main app
function App() {
  const [showHistory, setShowHistory] = useState(false);
  
  return (
    <WebSocketProvider
      url="ws://localhost:10013"
      autoConnect={true}
      reconnect={true}
      onConnect={() => console.log('Connected to Amigo')}
      onError={(error) => console.error('Connection error:', error)}
      renderers={{
        message: CustomMessageRenderer,
      }}
    >
      <div className="app-container">
        {/* Sidebar */}
        <aside className={`sidebar ${showHistory ? 'open' : ''}`}>
          <ConversationHistory
            onSelectConversation={(taskId) => {
              console.log('Selected:', taskId);
              setShowHistory(false);
            }}
          />
        </aside>
        
        {/* Main content */}
        <main className="main-content">
          {/* Header */}
          <header className="header">
            <button onClick={() => setShowHistory(!showHistory)}>
              ☰ History
            </button>
            <TaskSwitcher />
            <ConnectionIndicator />
          </header>
          
          {/* Chat */}
          <ChatWindow className="chat-window" />
          
          {/* Input */}
          <MessageInput
            className="message-input"
            placeholder="Ask me anything..."
            showMentions={true}
          />
        </main>
      </div>
    </WebSocketProvider>
  );
}

export default App;
```

## API Reference

For detailed API documentation, see the [TypeScript definitions](./src/sdk/index.ts) or use your IDE's IntelliSense.

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions

## License

ISC

## Contributing

Contributions are welcome! Please see the main repository for contribution guidelines.

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/your-org/amigo/issues)
- Documentation: [Full documentation](https://github.com/your-org/amigo)

---

Made with ❤️ by the Amigo team
