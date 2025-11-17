import path from "node:path";
import dotenv from "dotenv";
import AmigoServer from "./core/server";

dotenv.config();

// 加载 server
const SERVER_PORT = "10013";
const server = new AmigoServer({
  port: SERVER_PORT,
  globalStoragePath: path.resolve(process.cwd(), "storage"),
});
import { logger } from "./utils/logger";

server.init();

logger.info(`Server started at port ${SERVER_PORT}`);