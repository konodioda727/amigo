import type { ToolNames, SYSTEM_RESERVED_TAGS, ChatMessage } from "@amigo/types";
import { systemReservedTags } from "@amigo/types";
import { findMatchedTag } from "./findMatchedTag";

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
  onMessageLeft,
  checkShouldAbort,
}: {
  stream: AsyncIterable<any>;
  startLabels: string[];
  onCommonMessageFound?: (message: string) => void;
  onFullToolCallFound?: (
    message: string,
    currentTool: CurrentTool,
    currentType: ChatMessage["type"],
  ) => void;
  onPartialToolCallFound?: (
    message: string,
    currentTool: CurrentTool,
    currentType: ChatMessage["type"],
  ) => void;
  onMessageLeft?: (message: string) => void;
  checkShouldAbort?: () => boolean;
}) => {
  let buffer = "";
  let isMatched = false;
  let currentTool: CurrentTool = null;
  for await (const chunk of stream) {
    const shouldAbort = checkShouldAbort?.();
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
          onCommonMessageFound?.(precedingMessage);
        }

        buffer = buffer.slice(labelIndex);
      } else {
        // 如果存在 '<'，但不匹配任何标签，处理前面的普通消息， 保持 buffer 为标签相关内容
        if (buffer.includes("<")) {
          const firstAngleIndex = buffer.indexOf("<");
          const precedingMessage = buffer.slice(0, firstAngleIndex);
          if (precedingMessage.length > 0) {
            onCommonMessageFound?.(precedingMessage);
          }
          buffer = buffer.slice(firstAngleIndex);
        }
        // 处理非标签开头的内容，避免遗漏普通消息
        if (!isPotentialTagStart(buffer, startLabels)) {
          onCommonMessageFound?.(buffer);
        }
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
      onFullToolCallFound?.(fullToolCall, currentTool, currentType);
      buffer = buffer.slice(endLabelIndex + endTag.length);
      isMatched = false;
    } else {
      onPartialToolCallFound?.(buffer, currentTool, currentType);
    }
  }
  if (buffer.length > 0) {
    onMessageLeft?.(buffer);
  }
  return currentTool;
};
