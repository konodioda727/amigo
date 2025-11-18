import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useWebSocket } from "../WebSocketProvider";

export type ButtonState = "send" | "stop" | "resume";

export const useButtonState = (editor: Editor | null) => {
  const { displayMessages, isLoading } = useWebSocket();
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
    // 如果正在 loading，显示 stop 按钮
    if (isLoading) {
      setButtonState("stop");
      return;
    }

    if (!lastMessage) {
      setButtonState("send");
      return;
    }

    // 检查是否是中断状态
    if (lastMessage.type === "interrupt") {
      const hasContent = editorContent.trim();
      setButtonState(hasContent ? "send" : "resume");
      return;
    }

    // 默认状态
    setButtonState("send");
  }, [lastMessage, editorContent, isLoading]);

  return buttonState;
};
