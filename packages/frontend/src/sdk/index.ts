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
  MessageInputProps,
  MessageInputRef,
  TaskRendererProps,
} from "./components";
export { ChatWindow, MessageInput, TaskRenderer } from "./components";

// ============================================================================
// Renderers
// ============================================================================

export {
  DefaultAlertRenderer,
  DefaultAskFollowupQuestionRenderer,
  DefaultBrowserSearchRenderer,
  DefaultEditFileRenderer,
  DefaultErrorRenderer,
  DefaultInterruptRenderer,
  DefaultListFilesRenderer,
  DefaultMessageRenderer,
  DefaultReadFileRenderer,
  DefaultRunChecksRenderer,
  DefaultToolRenderer,
  DefaultUserMessageRenderer,
  defaultRenderers,
  EditFileResultBody,
  ReadFileResultBody,
  ToolAccordion,
  ToolCodeBlock,
} from "./components/renderers";

export type {
  AlertRendererProps,
  AskFollowupQuestionRendererProps,
  CommonMessageRendererProps,
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

export type { DocType } from "./store/slices/docSlice";
// Re-export all types from the types module
export type * from "./types";

// ============================================================================
// Context (for advanced use cases)
// ============================================================================

export type { WebSocketContextValue } from "./context/WebSocketContext";
export { useWebSocketContext } from "./context/WebSocketContext";
