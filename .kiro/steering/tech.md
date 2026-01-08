# Tech Stack

## Build System & Package Management

- **Package Manager**: pnpm with workspace support
- **Monorepo Structure**: Three packages (frontend, server, types)
- **Runtime**: Bun for server-side execution (4x faster than Node.js)
- **Module System**: ESNext with bundler resolution

## Frontend Stack

- **Framework**: React 18 with TypeScript 5
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 4 + DaisyUI
- **State Management**: Zustand for global state
- **Rich Text**: TipTap with mention support
- **Icons**: Lucide React, React Icons
- **Utilities**: lodash, uuid, streamdown, react-hot-toast

## Backend Stack

- **Runtime**: Bun (native WebSocket support)
- **LLM Framework**: LangChain (@langchain/core, @langchain/openai)
- **Validation**: Zod for runtime type checking
- **XML Parsing**: fast-xml-parser for streaming tool call extraction
- **Browser Automation**: Playwright with Chromium
- **Utilities**: p-wait-for, uuid, dotenv

## Shared Types Package

- **Validation**: Zod schemas for all message types and tool parameters
- **Build**: Bun bundler with minification

## Code Quality

- **Linter/Formatter**: Biome (replaces ESLint + Prettier, 25x faster)
- **TypeScript**: Strict mode enabled across all packages
- **Config**: 2-space indentation, 100 character line width
- **Git Hooks**: Lefthook for pre-commit checks

## Testing

- **Test Runner**: Bun test
- **Property Testing**: fast-check for property-based tests
- **Test Types**: Integration tests, property tests

## Common Commands

```bash
# Development (runs frontend and server concurrently)
pnpm dev

# Frontend only
pnpm --filter frontend start

# Server only (with watch mode)
pnpm --filter server start

# Build all packages
pnpm build

# Build specific package
pnpm --filter types build
pnpm --filter frontend build

# Format/lint with Biome
biome check --write .

# Run tests
pnpm --filter server test

# Type checking
pnpm --filter frontend tsc --noEmit
pnpm --filter server tsc --noEmit
```

## Environment Setup

- Server requires `.env` file in `packages/server/`
- Required env vars: `OPENAI_API_KEY`, optional: `OPENAI_BASE_URL`, `PORT`, `STORAGE_PATH`
- Server port defaults to 10013
- Storage path: `packages/server/storage/`

## Version Management

- **Changesets**: Used for version management and changelog generation
- **Publishing**: `pnpm release` builds and publishes all packages
