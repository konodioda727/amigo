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
│   ├── conversationManager/     # Manages conversation lifecycle
│   │   ├── index.ts             # Main ConversationManager class
│   │   ├── StreamHandler.ts     # LLM stream processing
│   │   ├── ToolExecutor.ts      # Tool invocation logic
│   │   ├── MessageEmitter.ts    # WebSocket message emission
│   │   └── ErrorHandler.ts      # Error handling
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

### Path Aliases
- Use `@/*` for imports relative to `src/` directory
- Example: `import { logger } from "@/utils/logger"`

### Message Flow
1. User sends message via WebSocket
2. Server resolves message type and creates/retrieves ConversationManager
3. ConversationManager streams LLM response
4. XML parser extracts tool calls from stream
5. Tools execute and emit results back to client
6. All messages persisted to storage

### Tool System
- Tools defined in `packages/server/src/core/tools/`
- Tool schemas in `packages/types/src/tool/`
- Tools can spawn sub-agents with custom prompts
- XML-based tool invocation format
- Tool registration via ToolRegistry

### State Management
- Server: FilePersistedMemory for conversation history
- Frontend: Zustand slices for different state domains (connection, messages, tasks)
- Task hierarchy tracked via parent-child relationships

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
