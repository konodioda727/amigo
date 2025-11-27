import { useMemo } from "react";
import type { DisplayMessageType } from "@/messages/types";

interface SubTaskStatus {
  hasFollowupQuestion: boolean;
  hasError: boolean;
}

/**
 * Hook to compute subtask status from display messages
 */
export const useSubTaskStatus = (displayMessages: DisplayMessageType[]): SubTaskStatus => {
  return useMemo(() => {
    const lastMessage = displayMessages[displayMessages.length - 1];
    
    return {
      hasFollowupQuestion: lastMessage?.type === "askFollowupQuestion",
      hasError: lastMessage?.type === "error",
    };
  }, [displayMessages]);
};
