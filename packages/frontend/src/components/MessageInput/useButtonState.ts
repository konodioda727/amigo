import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useWebSocket } from "../WebSocketProvider";

export type ButtonState = "send" | "stop" | "resume";

export const useButtonState = (editor: Editor | null) => {
  const { displayMessages } = useWebSocket();
  const [buttonState, setButtonState] = useState<ButtonState>("send");
  const [editorContent, setEditorContent] = useState("");

  const lastMessage = displayMessages[displayMessages.length - 1];

  // Track editor content changes
  useEffect(() => {
    if (!editor) return;

    const updateContent = () => {
      setEditorContent(editor.getText());
    };

    editor.on("update", updateContent);
    return () => {
      editor.off("update", updateContent);
    };
  }, [editor]);

  useEffect(() => {
    if (!lastMessage) {
      setButtonState("send");
      return;
    }

    if (lastMessage.type === "interrupt") {
      const hasContent = editorContent.trim();
      setButtonState(hasContent ? "send" : "resume");
      return;
    }

    if ("status" in lastMessage) {
      const status = (lastMessage as { status: string }).status;
      if (status === "pending" || status === "acked") {
        setButtonState("stop");
        return;
      }
    }

    if (
      ("message" in lastMessage || "think" in lastMessage) &&
      (lastMessage as { partial?: boolean }).partial
    ) {
      setButtonState("stop");
      return;
    }

    setButtonState("send");
  }, [lastMessage, editorContent]);

  return buttonState;
};
