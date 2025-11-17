---
inclusion: always
---

# Project Structure

## Monorepo Layout

```
packages/
├── frontend/          # React frontend application
├── server/            # Bun backend server
└── types/             # Shared TypeScript types
```

## Frontend (`packages/frontend/`)

```
src/
├── components/
│   ├── renderers/           # Message rendering components
│   │   ├── toolRenderer/    # Tool-specific renderers
│   │   └── *.tsx            # Message type renderers
│   ├── ChatWindow.tsx       # Main chat interface
│   ├── ConversationHistory.tsx
│   ├── MessageInput.tsx
│   ├── SubTaskRenderer.tsx
│   └── WebSocketProvider.tsx  # WebSocket context provider
├── messages/
│   ├── resolvers/           # Message type resolvers
│   ├── messageCombiner.ts   # Message aggregation logic
│   └── types.ts
├── App.tsx
└── main.tsx
```

## Server (`packages/server/`)

```
src/
├── core/
│   ├── conversationManager/  # Manages conversation lifecycle
│   ├── memory/               # Persistent storage layer
│   ├── messageResolver/      # WebSocket message handlers
│   │   ├── commonMessageResolver/
│   │   ├── interruptMessageResolver/
│   │   └── loadTaskMessageResolver/
│   ├── model/                # LLM configuration
│   ├── server/               # WebSocket server setup
│   ├── systemPrompt/         # System prompts for agents
│   │   ├── main/             # Main agent prompts
│   │   └── sub/              # Sub-agent prompts
│   └── tools/                # Agent tool implementations
├── globalState/              # Shared application state
├── utils/                    # Utility functions
└── index.ts                  # Server entry point
storage/                      # Persisted conversation data
```

## Types (`packages/types/`)

```
src/
├── conversation/             # Conversation type definitions
├── storage/                  # Storage schemas
├── tool/                     # Tool parameter types
└── websocketMessage/         # WebSocket message schemas
    ├── serverSend/           # Server → Client messages
    └── userSend/             # Client → Server messages
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

### State Management
- Server: FilePersistedMemory for conversation history
- Frontend: React Context for WebSocket state
- Task hierarchy tracked via parent-child relationships

### Naming Conventions
- Components: PascalCase (e.g., `ChatWindow.tsx`)
- Utilities: camelCase (e.g., `parseStreamingXml.ts`)
- Types: PascalCase interfaces/types
- Files: Match primary export name
