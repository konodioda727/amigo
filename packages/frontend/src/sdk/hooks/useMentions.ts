import { useCallback, useMemo } from "react";
import { useWebSocketContext } from "../context/WebSocketContext";
import type { UseMentionsReturn } from "../types/hooks";
import type { MentionItem } from "../types/store";

/**
 * Hook to access mention suggestions and followup queue.
 * Provides available mentions, mention operations, and followup queue state.
 *
 * @returns Mention suggestions and operations
 * @throws {Error} If used outside of WebSocketProvider
 *
 * @example
 * ```tsx
 * function MentionInput() {
 *   const { mentions, getMentionSuggestions, followupQueue, pendingMention } = useMentions();
 *   const [query, setQuery] = useState('');
 *
 *   const suggestions = getMentionSuggestions(query);
 *
 *   return (
 *     <div>
 *       <input value={query} onChange={e => setQuery(e.target.value)} />
 *       {suggestions.map(mention => (
 *         <div key={mention.id}>{mention.label}</div>
 *       ))}
 *       {pendingMention && <div>Pending: {pendingMention}</div>}
 *       <div>Queue: {followupQueue.length} items</div>
 *     </div>
 *   );
 * }
 * ```
 */
export function useMentions(): UseMentionsReturn {
  const context = useWebSocketContext();
  const { store } = context;

  // Get mention state using Zustand selectors
  const followupQueue = store((state) => state.followupQueue);
  const pendingMentionData = store((state) => state.pendingMention);
  const tasks = store((state) => state.tasks);

  // Convert pending mention to string format
  const pendingMention = pendingMentionData?.taskId || null;

  // Build mentions list from tasks and followup queue
  const mentions = useMemo((): MentionItem[] => {
    const mentionItems: MentionItem[] = [];

    // Add tasks as mentions
    Object.keys(tasks).forEach((taskId) => {
      mentionItems.push({
        id: taskId,
        label: `Task ${taskId}`,
        type: "task",
      });
    });

    // Add followup queue items as mentions
    followupQueue.forEach((item) => {
      // Avoid duplicates
      if (!mentionItems.find((m) => m.id === item.taskId)) {
        mentionItems.push({
          id: item.taskId,
          label: item.title,
          type: "task",
        });
      }
    });

    return mentionItems;
  }, [tasks, followupQueue]);

  // Get mention suggestions based on query
  const getMentionSuggestions = useCallback(
    (query: string): MentionItem[] => {
      if (!query) {
        return mentions;
      }

      const lowerQuery = query.toLowerCase();
      return mentions.filter(
        (mention) =>
          mention.label.toLowerCase().includes(lowerQuery) ||
          mention.id.toLowerCase().includes(lowerQuery),
      );
    },
    [mentions],
  );

  // Convert followup queue to string array for backward compatibility
  const followupQueueStrings = useMemo(() => {
    return followupQueue.map((item) => item.taskId);
  }, [followupQueue]);

  return {
    mentions,
    getMentionSuggestions,
    followupQueue: followupQueueStrings,
    pendingMention,
  };
}
