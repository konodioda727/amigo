# Requirements Document

## Introduction

This document specifies the requirements for restructuring the Amigo frontend package as an SDK with a clear separation between SDK exports and a demo application entry point. The SDK allows developers to integrate the AI agent orchestration system into their own React applications with customizable rendering while maintaining type safety and ease of use.

## Glossary

- **SDK**: The core reusable exports from the frontend package
- **Demo_App**: Example application entry point that demonstrates SDK usage
- **WebSocketProvider**: React context provider that manages WebSocket connection and state
- **MessageRenderer**: Component or function that renders specific message types
- **Consumer**: Developer using the SDK in their application
- **Default_Renderer**: Built-in renderer provided by the SDK
- **Custom_Renderer**: User-defined renderer that follows SDK type constraints

## Requirements

### Requirement 1: SDK Package Structure

**User Story:** As a developer, I want to use the frontend package as an SDK, so that I can integrate AI agent functionality into my React application.

#### Acceptance Criteria

1. THE frontend package SHALL export all SDK functionality from src/sdk/index.ts
2. THE frontend package SHALL maintain a separate demo application entry point at src/main.tsx
3. THE SDK exports SHALL include all necessary types, hooks, components, and utilities
4. THE SDK SHALL provide TypeScript type definitions for all exports
5. THE SDK SHALL be tree-shakeable to minimize bundle size
6. THE package.json SHALL define separate entry points for SDK and demo app

### Requirement 2: WebSocket Provider Integration

**User Story:** As a developer, I want to wrap my application with a WebSocketProvider, so that all child components can access the WebSocket connection and state.

#### Acceptance Criteria

1. THE SDK SHALL provide a WebSocketProvider component that accepts configuration props
2. WHEN WebSocketProvider is mounted, THE SDK SHALL establish a WebSocket connection to the specified server URL
3. THE WebSocketProvider SHALL manage connection state (connecting, connected, disconnected, error)
4. THE WebSocketProvider SHALL provide connection methods (connect, disconnect, send) via React context
5. THE WebSocketProvider SHALL handle automatic reconnection with configurable retry logic
6. WHEN WebSocketProvider unmounts, THE SDK SHALL clean up the WebSocket connection
7. THE WebSocketProvider SHALL accept optional event handlers (onConnect, onDisconnect, onError, onMessage)

### Requirement 3: State Management Hooks

**User Story:** As a developer, I want to access conversation state through hooks, so that I can build custom UI components.

#### Acceptance Criteria

1. THE SDK SHALL provide a useMessages hook that returns the current message list
2. THE SDK SHALL provide a useConnection hook that returns connection state and methods
3. THE SDK SHALL provide a useTasks hook that returns task hierarchy and status
4. THE SDK SHALL provide a useMentions hook that returns available mention suggestions
5. WHEN state updates occur, THE SDK SHALL trigger re-renders only for components using affected state
6. THE SDK SHALL provide a useSendMessage hook that returns a function to send messages

### Requirement 4: Customizable Message Renderers

**User Story:** As a developer, I want to provide custom renderers for message types, so that I can control how messages are displayed in my application.

#### Acceptance Criteria

1. THE SDK SHALL define TypeScript interfaces for all message renderer function signatures
2. THE SDK SHALL provide default renderer implementations for all message types
3. WHEN a custom renderer is provided, THE SDK SHALL use it instead of the default renderer
4. WHEN no custom renderer is provided, THE SDK SHALL fall back to the default renderer
5. THE SDK SHALL pass typed message data and utility functions to renderer functions
6. THE SDK SHALL validate that custom renderers match the required type signature at compile time
7. THE SDK SHALL support renderer customization at the provider level or per-component level

### Requirement 5: Default UI Components

**User Story:** As a developer, I want to use pre-built UI components, so that I can quickly integrate chat functionality without building everything from scratch.

#### Acceptance Criteria

1. THE SDK SHALL provide a ChatWindow component that renders the complete chat interface
2. THE SDK SHALL provide a MessageInput component with mention support
3. THE SDK SHALL provide a ConversationHistory component for displaying past conversations
4. THE SDK SHALL provide a TaskRenderer component for displaying task hierarchies
5. THE SDK SHALL allow styling customization through className props and CSS variables
6. THE SDK SHALL provide unstyled component variants for full styling control

### Requirement 6: Type-Safe Renderer API

**User Story:** As a developer, I want TypeScript to enforce correct renderer signatures, so that I catch errors at compile time rather than runtime.

#### Acceptance Criteria

1. THE SDK SHALL define a MessageRendererProps type for each message type
2. THE SDK SHALL define a MessageRenderer type as a function accepting MessageRendererProps and returning ReactNode
3. WHEN a developer provides a custom renderer, THE SDK SHALL enforce type compatibility through TypeScript
4. THE SDK SHALL provide utility types for common renderer patterns (e.g., ToolRenderer, StreamRenderer)
5. THE SDK SHALL export all renderer-related types from the main package entry point

### Requirement 7: Renderer Configuration

**User Story:** As a developer, I want to configure custom renderers in one place, so that they apply throughout my application.

#### Acceptance Criteria

1. THE WebSocketProvider SHALL accept a renderers prop containing custom renderer mappings
2. THE SDK SHALL merge custom renderers with default renderers
3. WHEN rendering a message, THE SDK SHALL look up the appropriate renderer by message type
4. THE SDK SHALL provide a useRenderer hook for accessing configured renderers
5. THE SDK SHALL allow renderer overrides at the component level for specific use cases

### Requirement 8: Message Handling and Transformation

**User Story:** As a developer, I want the SDK to handle message parsing and transformation, so that I receive clean, typed data in my renderers.

#### Acceptance Criteria

1. THE SDK SHALL parse incoming WebSocket messages and validate them against Zod schemas
2. THE SDK SHALL combine streaming message chunks into complete messages
3. THE SDK SHALL maintain message order and threading relationships
4. WHEN invalid messages are received, THE SDK SHALL log errors and emit error events
5. THE SDK SHALL provide access to raw message data for advanced use cases

### Requirement 9: Documentation and Examples

**User Story:** As a developer, I want comprehensive documentation and examples, so that I can quickly learn how to use the SDK.

#### Acceptance Criteria

1. THE SDK SHALL include a README with installation and quick start instructions
2. THE SDK SHALL provide TypeDoc-generated API documentation
3. THE demo application SHALL serve as a reference implementation
4. THE SDK SHALL document all renderer types and their expected props
5. THE SDK SHALL provide code examples in the documentation

### Requirement 10: Demo Application

**User Story:** As a developer, I want to see a working example of the SDK, so that I can understand how to integrate it into my own application.

#### Acceptance Criteria

1. THE frontend package SHALL include a demo application at src/main.tsx
2. THE demo application SHALL use the SDK exports exclusively (no direct imports from non-SDK paths)
3. THE demo application SHALL demonstrate WebSocketProvider configuration
4. THE demo application SHALL demonstrate custom renderer usage
5. THE demo application SHALL demonstrate all major SDK features
6. WHEN running pnpm dev, THE demo application SHALL start successfully
