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
├── components/
│   ├── ChatWindow/              # Main chat interface
│   ├── MessageRenderers/        # Message type renderers
│   │   └── toolRenderer/        # Tool-specific renderers
│   ├── MessageInput/            # Input with mention support
│   │   └── hooks/               # Input-related hooks
│   ├── SubTaskRenderer/         # Subtask display
│   │   └── hooks/               # Subtask status hooks
│   ├── Layout/                  # Layout components
│   ├── ConversationHistory.tsx
│   ├── ErrorBoundary.tsx
│   └── ...
├── store/
│   ├── slices/                  # Zustand state slices
│   ├── messageHandlers/         # WebSocket message handlers
│   └── websocket.ts             # WebSocket connection logic
├── messages/
│   ├── messageCombiner.ts       # Message aggregation logic
│   └── types.ts
├── hooks/                       # Shared React hooks
├── utils/                       # Utility functions
├── styles/                      # Global styles and tokens
├── App.tsx
└── main.tsx
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
