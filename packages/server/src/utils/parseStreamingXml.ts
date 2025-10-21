import type { ToolNames, SYSTEM_RESERVED_TAGS, ChatMessage } from "@amigo/types";
import { systemReservedTags } from "@amigo/types";
import { findMatchedTag } from "./findMatchedTag";
import { on } from "events";

function isPotentialTagStart(buffer: string, startLabels: string[]): boolean {
  if (buffer.length === 0) return false;
  const lastChunk = buffer;
  return startLabels.some((label) => label.startsWith(lastChunk));
}

type CurrentTool = SYSTEM_RESERVED_TAGS | ToolNames | null;

export const parseStreamingXml = async ({
  stream,
  startLabels,
  onFullToolCallFound,
  onPartialToolCallFound,
  onCommonMessageFound,
  onPartialMessageFound,
  onMessageLeft,
  checkShouldAbort,
}: {
  stream: AsyncIterable<any>;
  startLabels: string[];
  onCommonMessageFound?: (message: string) => Promise<void>;
  onPartialMessageFound?: (message: string) => Promise<void>;
  onFullToolCallFound?: (
    message: string,
    currentTool: CurrentTool,
    currentType: ChatMessage["type"],
  ) => Promise<void>;
  onPartialToolCallFound?: (
    message: string,
    currentTool: CurrentTool,
    currentType: ChatMessage["type"],
  ) => Promise<void>;
  onMessageLeft?: (message: string) => Promise<void>;
  checkShouldAbort?: () => Promise<boolean>;
}) => {
  let buffer = "";
  let isMatched = false;
  let currentTool: CurrentTool = null;
  for await (const chunk of stream) {
    const shouldAbort = await checkShouldAbort?.();
    if (shouldAbort) {
      currentTool = "interrupt";
      buffer = "";
      break;
    }

    if (typeof chunk.content === "string") {
      process.stdout.write(chunk.content);
      buffer += chunk.content;
    }

    if (!isMatched) {
      if (!buffer.trim().length) continue;
      const { labelIndex, currentTool: matchedTool } = findMatchedTag(startLabels, buffer);

      currentTool = matchedTool as SYSTEM_RESERVED_TAGS | ToolNames;

      if (labelIndex !== -1) {
        isMatched = true;
        // 立即输出 Tag 之前的所有内容作为最终普通消息
        const precedingMessage = buffer.slice(0, labelIndex);
        if (precedingMessage.length > 0) {
          await onCommonMessageFound?.(precedingMessage);
        }

        buffer = buffer.slice(labelIndex);
      } else {
        if (!buffer.includes("<")) {
          await onPartialMessageFound?.(buffer);
          continue;
        }
        const firstAngleIndex = buffer.indexOf("<");
        const precedingMessage = buffer.slice(0, firstAngleIndex);
        const posibleTagStart = buffer.slice(firstAngleIndex);
        await onPartialMessageFound?.(
          isPotentialTagStart(posibleTagStart, startLabels) ? precedingMessage : buffer,
        );
        continue;
      }
    }

    const endTag = `</${currentTool}>`;
    const endLabelIndex = buffer.indexOf(endTag);
    const isEndTagFound = endLabelIndex !== -1;
    const isSystemPreservedTag =
      currentTool && systemReservedTags.includes(currentTool as SYSTEM_RESERVED_TAGS);
    const currentType = (isSystemPreservedTag ? currentTool! : "tool") as ChatMessage["type"];

    if (isEndTagFound) {
      const fullToolCall = buffer.slice(0, endLabelIndex + endTag.length);
      await onFullToolCallFound?.(fullToolCall, currentTool, currentType);
      buffer = buffer.slice(endLabelIndex + endTag.length);
      isMatched = false;
    } else {
      await onPartialToolCallFound?.(buffer, currentTool, currentType);
    }
  }
  if (buffer.length > 0) {
    await onMessageLeft?.(buffer);
  }
  return currentTool;
};
