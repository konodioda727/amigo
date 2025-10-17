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
server.init();

console.log("server started at", SERVER_PORT);