import type { MessageHandler } from "./index.js";

export const handleDefault: MessageHandler = (_message, _store) => {
  // 默认处理：不做特殊处理，继续添加到 displayMessages
  return false;
};
