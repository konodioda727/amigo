# Project Structure

## Monorepo Layout

```
packages/
├── frontend/          # React frontend application
├── server/            # Bun backend server
└── types/             # Shared TypeScript types and Zod schemas
```

## Frontend (`packages/frontend/`)

```
src/
├── components/              # App-specific components
│   ├── Layout/              # Layout with sidebar context
│   ├── Sidebar.tsx          # Sidebar with conversation list
│   ├── Header.tsx           # Header with connection status
│   ├── ConversationHistory.tsx  # Wrapper with routing
│   ├── NewChatButton.tsx    # New chat with routing
│   └── ErrorBoundary.tsx
├── pages/                   # Route pages
│   ├── HomePage.tsx         # Default chat view (/)
│   └── ChatPage.tsx         # Task-specific view (/:taskId)
├── sdk/                     # Reusable SDK components
│   ├── components/          # SDK UI components
│   │   ├── ChatWindow.tsx   # Message display
│   │   ├── MessageInput.tsx # Input with mentions
│   │   ├── ConversationHistory.tsx  # History list
│   │   ├── TaskRenderer.tsx
│   │   └── renderers/       # Message renderers
│   ├── hooks/               # SDK React hooks
│   ├── store/               # Zustand store
│   │   ├── messageHandlers/ # WebSocket handlers
│   │   └── slices/          # State slices
│   ├── context/             # React contexts
│   ├── messages/            # Message utilities
│   └── provider/            # WebSocket provider
├── hooks/                   # App-specific hooks
├── utils/                   # Utility functions
├── App.tsx                  # Router setup
└── main.tsx                 # Entry point
```

## Server (`packages/server/`)

```
src/
├── core/
│   ├── conversation/            # Conversation management (refactored)
│   │   ├── Conversation.ts      # Conversation entity (state container)
│   │   ├── ConversationRepository.ts  # Conversation storage and retrieval
│   │   ├── ConversationExecutor.ts    # LLM interaction and tool execution
│   │   ├── WebSocketBroadcaster.ts    # WebSocket connection and messaging
│   │   ├── TaskOrchestrator.ts        # Parent-child task management
│   │   └── index.ts             # Public exports
│   ├── memory/                  # Persistent storage layer
│   ├── messageResolver/         # WebSocket message handlers
│   │   ├── base.ts              # Base resolver interface
│   │   ├── commonMessageResolver/
│   │   ├── interruptMessageResolver/
│   │   ├── loadTaskMessageResolver/
│   │   └── resumeMessageResolver/
│   ├── model/                   # LLM configuration
│   ├── server/                  # WebSocket server setup
│   ├── systemPrompt/            # System prompts for agents
│   │   ├── main/                # Main agent prompts
│   │   │   ├── objective.md
│   │   │   └── rules.md
│   │   ├── sub/                 # Sub-agent prompts
│   │   │   ├── objective.md
│   │   │   └── rules.md
│   │   ├── tools.ts             # Tool descriptions
│   │   └── tooluseGuide.md      # Tool usage guide
│   ├── tools/                   # Agent tool implementations
│   │   ├── base.ts              # Tool creation helper
│   │   ├── assignTasks.ts
│   │   ├── browserSearch.ts
│   │   ├── completionResult.ts
│   │   ├── askFollowupQuestions.ts
│   │   ├── todolist.ts
│   │   └── index.ts
│   ├── registry/                # Tool and message registries
│   ├── config/                  # Server configuration
│   └── builder/                 # Server builder API
├── sdk/                         # Public SDK exports
│   └── types/                   # SDK type definitions
├── globalState/                 # Shared application state
├── utils/                       # Utility functions
│   ├── logger.ts
│   ├── parseStreamingXml.ts
│   ├── browserManager.ts
│   └── ...
└── index.ts                     # Server entry point
storage/                         # Persisted conversation data
```

## Types (`packages/types/`)

```
src/
├── conversation/                # Conversation type definitions
├── storage/                     # Storage schemas
├── message/                     # Message type definitions
├── tool/                        # Tool parameter types
│   ├── assignTasks.ts
│   ├── browserSearch.ts
│   ├── completionResult.ts
│   ├── askFollowupQuestions.ts
│   ├── updateTodolist.ts
│   ├── think.ts
│   └── index.ts
└── websocketMessage/            # WebSocket message schemas
    ├── serverSend/              # Server → Client messages
    │   ├── ack.ts
    │   ├── alert.ts
    │   ├── assignTaskUpdated.ts
    │   ├── completionResult.ts
    │   ├── connected.ts
    │   ├── conversationOver.ts
    │   ├── error.ts
    │   ├── interrupt.ts
    │   ├── sessionHistories.ts
    │   ├── taskHistory.ts
    │   ├── think.ts
    │   ├── tool.ts
    │   └── index.ts
    └── userSend/                # Client → Server messages
        ├── message.ts
        ├── interrupt.ts
        ├── loadTask.ts
        ├── resume.ts
        └── index.ts
```

## Key Architectural Patterns

### Conversation Architecture (Single Responsibility)

The conversation system is split into focused components:

- **Conversation**: Pure entity holding state (id, memory, status, userInput)
- **ConversationRepository**: Manages conversation lifecycle (create, get, load from disk)
- **ConversationExecutor**: Handles LLM streaming and tool execution
- **WebSocketBroadcaster**: Manages WebSocket connections and message broadcasting
- **TaskOrchestrator**: Coordinates parent-child task relationships

### Routing Architecture

The frontend uses React Router for navigation:

- **Routes**:
  - `/` - HomePage: Default chat view for new conversations
  - `/:taskId` - ChatPage: Task-specific view that loads conversation history
  
- **Navigation Flow**:
  1. User clicks conversation in sidebar → Navigate to `/:taskId`
  2. ChatPage loads task history via WebSocket `loadTask` message
  3. URL reflects current conversation for bookmarking/sharing
  4. New chat button navigates to `/` and creates new conversation

- **State Synchronization**:
  - URL taskId syncs with Zustand store's mainTaskId
  - ConversationHistory highlights active conversation based on URL
  - Layout (Sidebar, Header) persists across route changes

### Path Aliases
- Use `@/*` for imports relative to `src/` directory
- Example: `import { logger } from "@/utils/logger"`

### Message Flow
1. User sends message via WebSocket
2. Server resolves message type via MessageResolver
3. ConversationRepository retrieves or creates Conversation
4. TaskOrchestrator sets user input
5. ConversationExecutor streams LLM response
6. XML parser extracts tool calls from stream
7. Tools execute and WebSocketBroadcaster emits results
8. All messages persisted to storage via Memory

### Tool System
- Tools defined in `packages/server/src/core/tools/`
- Tool schemas in `packages/types/src/tool/`
- Tools can spawn sub-agents via TaskOrchestrator
- XML-based tool invocation format
- Tool registration via ToolRegistry

### State Management
- Server: FilePersistedMemory for conversation history
- Frontend: Zustand slices for different state domains (connection, messages, tasks)
- Task hierarchy tracked via parent-child relationships in ConversationRepository

### Naming Conventions
- Components: PascalCase (e.g., `ChatWindow.tsx`)
- Utilities: camelCase (e.g., `parseStreamingXml.ts`)
- Types: PascalCase interfaces/types
- Files: Match primary export name
- Constants: UPPER_SNAKE_CASE

### Storage Structure
```
storage/
└── {conversationId}/
    ├── original.json      # Original message history
    └── websocket.json     # WebSocket-formatted messages
```
