# Implementation Plan: Frontend SDK

## Overview

This plan restructures the frontend package into an SDK with clear separation between reusable exports and demo application. Tasks are organized to build incrementally, starting with core infrastructure, then hooks and components, and finally the demo app integration.

## Tasks

- [x] 1. Create SDK directory structure and type definitions
  - Create `src/sdk/` directory with subdirectories: `provider/`, `hooks/`, `components/`, `types/`, `context/`, `store/`
  - Create `src/sdk/types/index.ts` with core type exports
  - Create `src/sdk/types/renderers.ts` with renderer type definitions (MessageRendererProps, MessageRenderer, MessageRendererMap)
  - Create `src/sdk/types/store.ts` with WebSocketStore and TaskState interfaces
  - Create `src/sdk/types/hooks.ts` with hook return type interfaces
  - _Requirements: 1.2, 1.4, 6.1, 6.2, 6.4, 6.5_

- [x] 2. Move and refactor Zustand store to SDK
  - [x] 2.1 Move store files to SDK structure
    - Move `src/store/websocket.ts` to `src/sdk/store/websocket.ts`
    - Move `src/store/slices/` to `src/sdk/store/slices/`
    - Move `src/store/messageHandlers/` to `src/sdk/store/messageHandlers/`
    - Update all internal imports to use relative paths
    - _Requirements: 1.2_

  - [x] 2.2 Create store factory function
    - Create `src/sdk/store/createWebSocketStore.ts`
    - Export factory function that accepts configuration
    - Ensure store can be created with custom initial state
    - _Requirements: 2.2, 2.3_

- [x] 3. Create WebSocket context and provider
  - [x] 3.1 Create WebSocket context
    - Create `src/sdk/context/WebSocketContext.tsx`
    - Define WebSocketContextValue interface
    - Create context with undefined default value
    - Export useWebSocketContext hook with error checking
    - _Requirements: 2.1, 2.4_

  - [x] 3.2 Implement WebSocketProvider component
    - Create `src/sdk/provider/WebSocketProvider.tsx`
    - Accept WebSocketProviderProps (url, autoConnect, reconnect, event handlers, renderers)
    - Initialize Zustand store with configuration
    - Establish WebSocket connection if autoConnect is true
    - Provide context value to children
    - Handle cleanup on unmount
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7, 7.1_

  - [x] 3.3 Write property test for provider initialization
    - **Property 1: Provider Initialization**
    - **Validates: Requirements 2.2, 2.3**

- [x] 4. Implement core hooks
  - [x] 4.1 Create useWebSocket hook
    - Create `src/sdk/hooks/useWebSocket.ts`
    - Return connection status, methods (connect, disconnect, reconnect, send, subscribe)
    - Use useWebSocketContext internally
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.2 Create useConnection hook
    - Create `src/sdk/hooks/useConnection.ts`
    - Return connection status and derived booleans (isConnected, isConnecting, isDisconnected)
    - Use Zustand selector for efficient re-renders
    - _Requirements: 3.2_

  - [x] 4.3 Create useMessages hook
    - Create `src/sdk/hooks/useMessages.ts`
    - Accept optional taskId parameter
    - Return messages, rawMessages, sendMessage, clearMessages
    - Default to currentTaskId if not provided
    - _Requirements: 3.1, 3.5_

  - [x] 4.4 Create useTasks hook
    - Create `src/sdk/hooks/useTasks.ts`
    - Return tasks, currentTaskId, mainTaskId, switchTask, getTaskHierarchy, getTaskStatus
    - _Requirements: 3.3_

  - [x] 4.5 Create useMentions hook
    - Create `src/sdk/hooks/useMentions.ts`
    - Return mentions, getMentionSuggestions, followupQueue, pendingMention
    - _Requirements: 3.4_

  - [x] 4.6 Create useSendMessage hook
    - Create `src/sdk/hooks/useSendMessage.ts`
    - Return sendMessage, sendInterrupt, sendResume, sendLoadTask functions
    - _Requirements: 3.6_

  - [x] 4.7 Write property test for hook context dependency
    - **Property 2: Hook Context Dependency**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

- [x] 5. Create renderer system
  - [x] 5.1 Create useRenderer hook
    - Create `src/sdk/hooks/useRenderer.ts`
    - Accept message type parameter
    - Return custom renderer if provided, otherwise default renderer
    - _Requirements: 4.3, 4.4, 7.2, 7.4_

  - [x] 5.2 Move and adapt default renderers
    - Create `src/sdk/components/renderers/` directory
    - Move renderer components from `src/components/MessageRenderers/` to SDK
    - Rename to Default* prefix (e.g., DefaultMessageRenderer)
    - Update to accept MessageRendererProps
    - _Requirements: 4.2, 4.5_

  - [x] 5.3 Create default renderer map
    - Create `src/sdk/components/renderers/index.tsx`
    - Export defaultRenderers object mapping message types to renderer functions
    - _Requirements: 4.2, 7.2_

  - [x] 5.4 Write property test for renderer fallback
    - **Property 4: Renderer Fallback**
    - **Validates: Requirements 4.4, 7.2**

  - [x] 5.5 Write property test for renderer props completeness
    - **Property 10: Renderer Props Completeness**
    - **Validates: Requirements 4.5**

- [x] 6. Create reusable UI components
  - [x] 6.1 Create ChatWindow component
    - Create `src/sdk/components/ChatWindow.tsx`
    - Accept ChatWindowProps (taskId, className, showHeader, headerContent)
    - Use useMessages and useRenderer hooks
    - Render messages using resolved renderers
    - _Requirements: 5.1, 5.5_

  - [x] 6.2 Create MessageInput component
    - Create `src/sdk/components/MessageInput.tsx`
    - Accept MessageInputProps (taskId, className, placeholder, onSend, disabled, showMentions)
    - Use useSendMessage and useMentions hooks
    - Include mention support with TipTap
    - _Requirements: 5.2, 5.5_

  - [x] 6.3 Create ConversationHistory component
    - Create `src/sdk/components/ConversationHistory.tsx`
    - Accept ConversationHistoryProps (className, onSelectConversation)
    - Use useTasks hook
    - Display list of conversations
    - _Requirements: 5.3, 5.5_

  - [x] 6.4 Create TaskRenderer component
    - Create `src/sdk/components/TaskRenderer.tsx`
    - Accept TaskRendererProps (taskId, showChildren, depth, className)
    - Use useTasks hook
    - Render task hierarchy recursively
    - _Requirements: 5.4, 5.5_

- [x] 7. Create SDK main entry point
  - Create `src/sdk/index.ts`
  - Export WebSocketProvider and WebSocketProviderProps
  - Export all hooks (useWebSocket, useMessages, useConnection, useTasks, useMentions, useSendMessage)
  - Export all components (ChatWindow, MessageInput, ConversationHistory, TaskRenderer)
  - Export all types from src/sdk/types/
  - Export defaultRenderers and renderer types
  - _Requirements: 1.2, 1.4_

- [x] 8. Update package.json for SDK exports
  - Update package.json main and types fields to point to SDK entry
  - Add exports field with SDK entry point and styles
  - Ensure peer dependencies are correctly specified
  - _Requirements: 1.1, 1.3_

- [-] 9. Refactor demo application to use SDK
  - [x] 9.1 Update App.tsx to use WebSocketProvider
    - Import WebSocketProvider from SDK
    - Wrap app content with WebSocketProvider
    - Pass configuration props (url, autoConnect, event handlers)
    - Remove direct store initialization
    - _Requirements: 10.2, 10.3_

  - [x] 9.2 Update demo components to use SDK exports
    - Update all imports in `src/components/` to use SDK exports
    - Update `src/App.tsx` to import from SDK
    - Update `src/main.tsx` if needed
    - Ensure no direct imports from `src/sdk/store/` or other internal paths
    - _Requirements: 10.2, 10.5_

  - [x] 9.3 Write static analysis test for demo app SDK isolation
    - **Property 9: Demo App SDK Isolation**
    - **Validates: Requirements 10.2**

- [x] 10. Checkpoint - Ensure all tests pass
  - Run all unit tests
  - Run all property tests
  - Verify demo app runs successfully
  - Check for TypeScript errors
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Write integration tests
  - [x] 11.1 Write integration test for complete SDK flow
    - Test Provider → Hooks → Components → Renderers flow
    - Test WebSocket message flow end-to-end
    - Test custom renderer integration
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 11.2 Write property test for message processing order
    - **Property 5: Message Processing Order**
    - **Validates: Requirements 8.3**

  - [x] 11.3 Write property test for connection state consistency
    - **Property 6: Connection State Consistency**
    - **Validates: Requirements 2.4, 3.2**

  - [x] 11.4 Write property test for task hierarchy integrity
    - **Property 7: Task Hierarchy Integrity**
    - **Validates: Requirements 3.3**

  - [x] 11.5 Write property test for message subscription cleanup
    - **Property 8: Message Subscription Cleanup**
    - **Validates: Requirements 2.7**

- [x] 12. Update documentation
  - Update README.md with SDK usage instructions
  - Add quick start guide
  - Document all exported hooks and components
  - Add examples for custom renderers
  - Document WebSocketProvider props
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 13. Final checkpoint - Verify all requirements
  - Verify all 10 requirements are met
  - Run full test suite
  - Test demo application thoroughly
  - Check bundle size and tree-shaking
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The demo app serves as both reference implementation and integration test
