import path from "node:path";
import dotenv from "dotenv";
import {
  USER_CODING_AGENT_AUTO_APPROVE_TOOLS,
  USER_CODING_AGENT_SYSTEM_PROMPT_APPENDIX,
  USER_CODING_AGENT_TOOLS,
} from "./appTools/codingAgentTools";
import { AmigoServerBuilder } from "./sdk";
import { logger } from "./utils/logger";

dotenv.config();

const isNonFatalStreamError = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason || "");
  return (
    message.includes("Failed to parse stream") || message.includes("Error reading from the stream")
  );
};

process.on("unhandledRejection", (reason) => {
  if (isNonFatalStreamError(reason)) {
    logger.warn(`[Global] 忽略非致命流式错误: ${reason}`);
    return;
  }
  logger.error("[Global] 未处理的 Promise 拒绝:", reason);
});

process.on("uncaughtException", (error) => {
  if (isNonFatalStreamError(error)) {
    logger.warn(`[Global] 忽略非致命流式异常: ${error.message}`);
    return;
  }
  logger.error("[Global] 未捕获异常:", error);
});

// 加载配置
const SERVER_PORT = Number(process.env.SERVER_PORT) || 10013;
const STORAGE_PATH = process.env.STORAGE_PATH || path.resolve(process.cwd(), "storage");

// 使用 builder 创建服务器
let builder = new AmigoServerBuilder().port(SERVER_PORT).storagePath(STORAGE_PATH);
for (const tool of USER_CODING_AGENT_TOOLS) {
  builder = builder.registerTool(tool);
}
const server = builder
  .addAutoApproveTools([...USER_CODING_AGENT_AUTO_APPROVE_TOOLS])
  .appendSystemPrompt(USER_CODING_AGENT_SYSTEM_PROMPT_APPENDIX)
  .build();

server.start();
logger.info(`Server started at port ${SERVER_PORT}`);
