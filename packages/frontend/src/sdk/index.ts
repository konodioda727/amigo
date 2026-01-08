/**
 * Amigo Frontend SDK
 *
 * This is the main entry point for the Amigo Frontend SDK.
 * It exports all public APIs including the WebSocketProvider, hooks, components, and types.
 *
 * @example
 * ```tsx
 * import {
 *   WebSocketProvider,
 *   useMessages,
 *   useConnection,
 *   ChatWindow,
 *   MessageInput,
 *   defaultRenderers,
 * } from '@amigo-llm/frontend';
 *
 * function App() {
 *   return (
 *     <WebSocketProvider
 *       url="ws://localhost:10013"
 *       autoConnect={true}
 *       renderers={{
 *         message: CustomMessageRenderer,
 *       }}
 *     >
 *       <ChatWindow />
 *       <MessageInput />
 *     </WebSocketProvider>
 *   );
 * }
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Provider
// ============================================================================

export type { WebSocketProviderProps } from "./provider/WebSocketProvider";
export { WebSocketProvider } from "./provider/WebSocketProvider";

// ============================================================================
// Hooks
// ============================================================================

export {
  useConnection,
  useMentions,
  useMessages,
  useRenderer,
  useSendMessage,
  useTasks,
  useWebSocket,
} from "./hooks";

export type {
  UseConnectionReturn,
  UseMentionsReturn,
  UseMessagesReturn,
  UseSendMessageReturn,
  UseTasksReturn,
  UseWebSocketReturn,
} from "./types/hooks";

// ============================================================================
// Components
// ============================================================================

export type {
  ChatWindowProps,
  ConversationHistoryProps,
  MessageInputProps,
  MessageInputRef,
  TaskRendererProps,
} from "./components";
export {
  ChatWindow,
  ConversationHistory,
  MessageInput,
  TaskRenderer,
} from "./components";

// ============================================================================
// Renderers
// ============================================================================

export {
  DefaultAlertRenderer,
  DefaultAskFollowupQuestionRenderer,
  DefaultAssignTaskRenderer,
  DefaultAssignTaskUpdatedRenderer,
  DefaultBrowserSearchRenderer,
  DefaultCompletionResultRenderer,
  DefaultErrorRenderer,
  DefaultInterruptRenderer,
  DefaultMessageRenderer,
  DefaultToolRenderer,
  DefaultUpdateTodolistRenderer,
  DefaultUserMessageRenderer,
  defaultRenderers,
} from "./components/renderers";

export type {
  AlertRendererProps,
  AskFollowupQuestionRendererProps,
  AssignTaskUpdatedRendererProps,
  CommonMessageRendererProps,
  CompletionResultRendererProps,
  ErrorRendererProps,
  InterruptRendererProps,
  MessageRenderer,
  MessageRendererMap,
  MessageRendererProps,
  ToolMessageRendererProps,
  UserMessageRendererProps,
} from "./types/renderers";

// ============================================================================
// Types
// ============================================================================

// Re-export all types from the types module
export type * from "./types";

// ============================================================================
// Context (for advanced use cases)
// ============================================================================

export type { WebSocketContextValue } from "./context/WebSocketContext";
export { useWebSocketContext } from "./context/WebSocketContext";
