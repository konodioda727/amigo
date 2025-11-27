import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useWebSocketStore } from "@/store/websocket";

export type ButtonState = "send" | "stop" | "resume";

export const useButtonState = (editor: Editor | null) => {
  const mainTaskId = useWebSocketStore((state) => state.mainTaskId);
  const taskState = useWebSocketStore((state) => state.tasks[mainTaskId]);
  const displayMessages = taskState?.displayMessages || [];
  const isLoading = taskState?.isLoading || false;
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

    // 检查是否是中断状态（优先级最高）
    if (lastMessage.type === "interrupt" && !isLoading) {
      const hasContent = editorContent.trim();
      setButtonState(hasContent ? "send" : "resume");
      return;
    }

    // 如果正在 loading，显示 stop 按钮
    if (isLoading) {
      setButtonState("stop");
      return;
    }

    // 默认状态
    setButtonState("send");
  }, [lastMessage, editorContent, isLoading]);

  return buttonState;
};
