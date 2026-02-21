import type { ChatMessage, SYSTEM_RESERVED_TAGS, ToolNames } from "@amigo-llm/types";
import { systemReservedTags } from "@amigo-llm/types";
import { findMatchedTag } from "./findMatchedTag";

function isPotentialTagStart(buffer: string, startLabels: string[]): boolean {
  if (buffer.length === 0) return false;
  const lastChunk = buffer;
  return startLabels.some((label) => label.startsWith(lastChunk));
}

type CurrentTool = SYSTEM_RESERVED_TAGS | ToolNames | "message";

export const parseStreamingXml = async ({
  stream,
  startLabels,
  signal,
  onFullToolCallFound,
  onPartialToolCallFound,
  onCommonMessageFound,
  onPartialMessageFound,
  onMessageLeft,
}: {
  stream: AsyncIterable<any>;
  startLabels: string[];
  signal?: AbortSignal;
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
}) => {
  let buffer = "";
  let isMatched = false;
  let currentTool: CurrentTool = "message";

  try {
    for await (const chunk of stream) {
      if (typeof chunk.content === "string") {
        buffer += chunk.content;
        console.log("[parseStreamingXml] 收到 chunk:", JSON.stringify(chunk.content));
      }

      if (!isMatched) {
        if (!buffer.trim().length) continue;
        const { labelIndex, currentTool: matchedTool } = findMatchedTag(startLabels, buffer);

        currentTool = (matchedTool || "message") as SYSTEM_RESERVED_TAGS | ToolNames;

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

      // 检测自闭合标签 (例如: <tool attr="value"/>)
      const selfClosingPattern = new RegExp(`<${currentTool}[^>]*\\/>`);
      const selfClosingMatch = buffer.match(selfClosingPattern);
      const isSelfClosing = selfClosingMatch !== null;

      const isSystemPreservedTag =
        currentTool && systemReservedTags.includes(currentTool as SYSTEM_RESERVED_TAGS);
      const currentType = (isSystemPreservedTag ? currentTool : "tool") as ChatMessage["type"];

      if (isEndTagFound) {
        const fullToolCall = buffer.slice(0, endLabelIndex + endTag.length);
        console.log("[parseStreamingXml] 找到完整工具调用:", currentTool);
        console.log("[parseStreamingXml] fullToolCall:", fullToolCall);
        console.log(
          "[parseStreamingXml] 工具调用后原本剩余 buffer:",
          JSON.stringify(buffer.slice(endLabelIndex + endTag.length)),
        );
        await onFullToolCallFound?.(fullToolCall, currentTool, currentType);
        // 清空 buffer，工具调用后的内容不应该被当作消息发送
        buffer = "";
        console.log("[parseStreamingXml] 已清空 buffer");
        isMatched = false;
      } else if (isSelfClosing && selfClosingMatch) {
        // 处理自闭合标签
        const fullToolCall = selfClosingMatch[0];
        console.log("[parseStreamingXml] 找到自闭合工具调用:", currentTool);
        console.log(
          "[parseStreamingXml] 自闭合工具调用后原本剩余 buffer:",
          JSON.stringify(buffer.slice(buffer.indexOf(fullToolCall) + fullToolCall.length)),
        );
        await onFullToolCallFound?.(fullToolCall, currentTool, currentType);
        // 清空 buffer，工具调用后的内容不应该被当作消息发送
        buffer = "";
        console.log("[parseStreamingXml] 已清空 buffer");
        isMatched = false;
      } else {
        await onPartialToolCallFound?.(buffer, currentTool, currentType);
      }
    }
  } catch (error: any) {
    // 如果是 AbortError，说明被用户中断
    if (error.name === "AbortError" || signal?.aborted) {
      currentTool = "interrupt";
      buffer = "";
    } else {
      throw error;
    }
  }

  if (buffer.length > 0) {
    console.log("[parseStreamingXml] 流结束，剩余 buffer:", JSON.stringify(buffer));
    await onMessageLeft?.(buffer);
  }
  return currentTool;
};
