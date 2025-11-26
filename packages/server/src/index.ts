import path from "node:path";
import dotenv from "dotenv";
import AmigoServer from "./core/server";

dotenv.config();

// 加载 server
const SERVER_PORT = process.env.SERVER_PORT || "10013";
const STORAGE_PATH = process.env.STORAGE_PATH || path.resolve(process.cwd(), "storage");

const server = new AmigoServer({
  port: SERVER_PORT,
  globalStoragePath: STORAGE_PATH,
});
import { logger } from "./utils/logger";

server.init();

logger.info(`Server started at port ${SERVER_PORT}`);