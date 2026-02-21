import { useWebSocketContext } from "../context/WebSocketContext";
import type { DisplayMessageType, MessageRenderer } from "../types";

/**
 * Hook to get the appropriate renderer for a message type
 *
 * Returns custom renderer if provided via WebSocketProvider,
 * otherwise returns undefined (caller should use default renderer)
 *
 * @param type - The message type to get renderer for
 * @returns The custom renderer function or undefined
 *
 * @example
 * ```tsx
 * const renderer = useRenderer('message');
 * if (renderer) {
 *   return renderer({ message, taskId, isLatest });
 * }
 * // Fall back to default renderer
 * return <DefaultMessageRenderer message={message} taskId={taskId} isLatest={isLatest} />;
 * ```
 */
export function useRenderer<T extends DisplayMessageType["type"]>(
  type: T,
): MessageRenderer<Extract<DisplayMessageType, { type: T }>> | undefined {
  const context = useWebSocketContext();

  // Return custom renderer if provided, otherwise undefined
  return context.renderers?.[type] as
    | MessageRenderer<Extract<DisplayMessageType, { type: T }>>
    | undefined;
}
