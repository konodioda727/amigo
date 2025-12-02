import path from "node:path";
import dotenv from "dotenv";
import { AmigoServerBuilder } from "./core";
import { logger } from "./utils/logger";

dotenv.config();

// 加载配置
const SERVER_PORT = Number(process.env.SERVER_PORT) || 10013;
const STORAGE_PATH = process.env.STORAGE_PATH || path.resolve(process.cwd(), "storage");

// 使用 builder 创建服务器
const server = new AmigoServerBuilder()
  .port(SERVER_PORT)
  .storagePath(STORAGE_PATH)
  .build();

server.init();

logger.info(`Server started at port ${SERVER_PORT}`);