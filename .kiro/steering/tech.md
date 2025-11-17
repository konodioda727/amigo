---
inclusion: always
---

# Tech Stack

## Build System & Package Management

- **Package Manager**: pnpm with workspace support
- **Monorepo Structure**: Three packages (frontend, server, types)
- **Runtime**: Bun for server-side execution
- **Module System**: ESNext with bundler resolution

## Frontend Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 4 + DaisyUI
- **State Management**: React Context (WebSocketProvider)
- **Icons**: Lucide React, React Icons
- **Utilities**: lodash, uuid, streamdown

## Backend Stack

- **Runtime**: Bun
- **WebSocket**: Native Bun WebSocket support
- **LLM Framework**: LangChain (@langchain/core, @langchain/langgraph)
- **Validation**: Zod
- **XML Parsing**: fast-xml-parser
- **Utilities**: p-wait-for, uuid, dotenv

## Shared Types Package

- **Validation**: Zod schemas
- **Build**: Bun bundler with minification

## Code Quality

- **Linter/Formatter**: Biome (replaces ESLint + Prettier)
- **TypeScript**: Strict mode enabled
- **Config**: 2-space indentation, 100 character line width

## Common Commands

```bash
# Development (runs frontend and server concurrently)
pnpm dev

# Frontend only
cd packages/frontend && pnpm start

# Server only (with watch mode)
cd packages/server && pnpm start

# Build frontend
cd packages/frontend && pnpm build

# Build types package
cd packages/types && pnpm build

# Format/lint with Biome
biome check --write .
```

## Environment Setup

- Server requires `.env` file in `packages/server/`
- Server port defaults to 10013
- Storage path: `packages/server/storage/`
