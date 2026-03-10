import type { ChatMessage, UserMessageAttachment } from "@amigo-llm/types";
import type { AmigoLlm, AmigoMessageContentPart, AmigoModelMessage } from "@/core/model";

const isGoogleGenAIModel = (llm: AmigoLlm) => llm.provider === "google-genai";

const toAttachmentContentBlock = (attachment: UserMessageAttachment): AmigoMessageContentPart => {
  const common = {
    mimeType: attachment.mimeType,
    url: attachment.url,
    name: attachment.name,
    size: attachment.size,
  };

  switch (attachment.kind) {
    case "image":
      return { type: "image", ...common };
    case "audio":
      return { type: "audio", ...common };
    case "video":
      return { type: "video", ...common };
    default:
      return { type: "file", ...common };
  }
};

const toHumanMessageContent = (message: ChatMessage): string | AmigoMessageContentPart[] => {
  if (!message.attachments || message.attachments.length === 0) {
    return message.content;
  }

  const blocks: AmigoMessageContentPart[] = [];
  if (message.content.trim()) {
    blocks.push({ type: "text", text: message.content });
  }

  for (const attachment of message.attachments) {
    blocks.push(toAttachmentContentBlock(attachment));
  }

  return blocks;
};

export const toModelMessages = (messages: ChatMessage[], llm: AmigoLlm): AmigoModelMessage[] => {
  if (isGoogleGenAIModel(llm)) {
    let firstSystemContent: string | null = null;
    const transformed: AmigoModelMessage[] = [];

    for (const message of messages) {
      if (message.role === "system") {
        if (!firstSystemContent) {
          firstSystemContent = message.content;
          continue;
        }
        transformed.push({
          role: "user",
          content: `SYSTEM NOTICE:\n${message.content}`,
        });
        continue;
      }

      if (message.role === "assistant") {
        transformed.push({ role: "assistant", content: message.content });
        continue;
      }

      transformed.push({
        role: "user",
        content: toHumanMessageContent(message),
      });
    }

    if (firstSystemContent) {
      return [{ role: "system", content: firstSystemContent }, ...transformed];
    }

    return transformed;
  }

  return messages.map((message): AmigoModelMessage => {
    switch (message.role) {
      case "system":
        return { role: "system", content: message.content };
      case "assistant":
        return { role: "assistant", content: message.content };
      default:
        return { role: "user", content: toHumanMessageContent(message) };
    }
  });
};
