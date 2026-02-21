# @amigo-llm/frontend

## 0.0.2

### Features

- **SDK Restructure**: Complete restructure of the frontend package as a reusable SDK
  - New `src/sdk/` directory with clear public API
  - Separate demo application from SDK exports
  - Tree-shakeable exports for optimal bundle size

- **WebSocketProvider**: Centralized connection and state management
  - Configurable connection options (autoConnect, reconnect, etc.)
  - Event handlers (onConnect, onDisconnect, onError, onMessage)
  - Custom renderer support at provider level

- **React Hooks**: Comprehensive hook API for accessing state
  - `useWebSocket` - Low-level WebSocket control
  - `useConnection` - Connection state and status
  - `useMessages` - Message list and operations
  - `useTasks` - Task hierarchy and management
  - `useMentions` - Mention suggestions and followup queue
  - `useSendMessage` - Send different message types
  - `useRenderer` - Access configured renderers

- **Reusable Components**: Pre-built UI components
  - `ChatWindow` - Complete chat interface
  - `MessageInput` - Input with mention support
  - `ConversationHistory` - Conversation list
  - `TaskRenderer` - Hierarchical task display

- **Customizable Renderers**: Type-safe message rendering system
  - Default renderers for all message types
  - Custom renderer support with TypeScript validation
  - Per-component renderer overrides
  - Renderer props include message, taskId, and isLatest flag

- **Type Safety**: Full TypeScript support
  - Exported types for all public APIs
  - Strict type checking for custom renderers
  - IntelliSense support in IDEs

- **Performance**: Optimized state management
  - Zustand for efficient re-renders
  - Selective subscriptions to minimize updates
  - Message combiner for streaming data

### Documentation

- Comprehensive README with quick start guide
- API reference for all hooks and components
- Custom renderer examples
- Complete example application
- TypeScript type documentation

### Testing

- Property-based tests for core functionality
- Integration tests for SDK flow
- Hook tests with React Testing Library
- Provider initialization tests
- Message processing tests

### Breaking Changes

- Package structure changed - imports now from `@amigo-llm/frontend` instead of internal paths
- Demo application moved to separate entry point
- Store is now internal to SDK (use hooks instead of direct store access)

### Migration Guide

**Before (0.0.1):**
```tsx
import { useWebSocketStore } from '@amigo-llm/frontend/store';
import ChatWindow from '@amigo-llm/frontend/components/ChatWindow';

const store = useWebSocketStore();
```

**After (0.0.2):**
```tsx
import {
  WebSocketProvider,
  ChatWindow,
  useMessages,
  useConnection,
} from '@amigo-llm/frontend';

<WebSocketProvider url="ws://localhost:10013">
  <ChatWindow />
</WebSocketProvider>
```

## 0.0.1

### Initial Release

- Basic WebSocket connection
- Message rendering
- Task management
- Zustand state management
- TipTap message input
- Tailwind CSS styling
