# Amigo

Amigo 是一个面向 coding agent / design agent 的 Bun monorepo。

这个仓库分成两层：

- `packages/backend`
  通用后端 SDK。负责会话运行时、工具执行、消息协议、任务编排和持久化抽象。
- `packages/amigo`
  完整应用。负责 MySQL、Better Auth、HTTP 路由、Feishu、automation、skills、design docs 和前端页面。

如果你只想运行完整产品，用 `packages/amigo`。  
如果你要把会话引擎接入自己的产品，用 `packages/backend` 和 `packages/frontend`。

## 仓库结构

- `packages/amigo`
  完整应用入口、应用层服务端、前端页面、数据库实现、部署脚本。
- `packages/backend`
  后端 SDK。负责会话、消息、工具、sandbox 生命周期、WebSocket runtime。
- `packages/frontend`
  React SDK。负责 WebSocket store、聊天窗口、消息输入框、默认渲染器。
- `packages/types`
  前后端共享协议和类型。

## 当前架构

这套仓库按下面的边界工作：

- `backend` 负责会话引擎和持久化接口
- `app` 负责数据库连接、migration、认证、渠道、HTTP 路由和产品功能
- 完整应用使用 MySQL 作为业务真相源
- `cachePath` / `.amigo` 只保留运行时资产和缓存，不承载业务真相

对 `packages/amigo` 来说，MySQL 是必需的。服务启动时会：

- 校验 MySQL 配置
- 自动跑 migration
- 初始化应用所需表结构

## 快速开始

### 前置要求

- Bun 1.x
- Node.js 18+
- Docker
- MySQL 8+

如果你要启用 sandbox：

- macOS: Docker Desktop
- Linux: Docker + `runsc`

### 1. 安装依赖

```bash
bun install
cp packages/amigo/.env.example packages/amigo/.env
```

### 2. 配置环境变量

最少需要这些项：

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=amigo
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=amigo

BETTER_AUTH_SECRET=replace_with_a_long_random_secret
BETTER_AUTH_BASE_URL=http://localhost:10013
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

模型相关配置现在默认走前端登录后的 `/models` 页面，不再要求在 `.env` 中填写 `MODEL_API_KEY`、`MODEL_NAME`、`MODEL_BASE_URL`。
如果你仍然想保留旧的环境变量兜底方式，也可以继续配置这三项。

参考：

- [packages/amigo/.env.example](/Users/lawkaiqing/code/amigo/packages/amigo/.env.example)

### 3. 准备数据库

应用会自动建表和跑 migration，但数据库本身需要先存在。

例如：

```sql
CREATE DATABASE amigo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'amigo'@'localhost' IDENTIFIED BY 'your_mysql_password';
GRANT ALL PRIVILEGES ON amigo.* TO 'amigo'@'localhost';
FLUSH PRIVILEGES;
```

### 4. 构建 sandbox 镜像

```bash
docker build -t ai_sandbox packages/amigo/assets
```

### 5. 启动开发环境

```bash
bun dev
```

默认地址：

- 前端: `http://localhost:3000`
- 服务端: `http://localhost:10013`
- WebSocket: `ws://localhost:10013/ws`

也可以拆开启动：

```bash
bun --filter @amigo-llm/amigo dev:server
bun --filter @amigo-llm/amigo dev:web
```

## 完整应用

完整应用入口在 [packages/amigo/src/server/app.ts](/Users/lawkaiqing/code/amigo/packages/amigo/src/server/app.ts)。

`packages/amigo` 负责：

- 读取 MySQL 和 Better Auth 配置
- 创建 MySQL 连接池
- 跑 migration
- 创建 MySQL 持久化 provider
- 注入 backend SDK
- 提供 HTTP / WebSocket / Auth / automation / skills / Feishu 等能力

你可以这样理解：

- `createAmigoApp(...)` 负责运行时装配
- `.env` 负责部署机密和外部服务凭据

示例：

```ts
import { createAmigoApp } from "./src/server/app";

const app = await createAmigoApp({
  port: 10013,
  cachePath: "/var/lib/amigo",
  loggerConfig: { level: 1 },
  sandboxConfig: {
    imageName: "ai_sandbox",
    runtime: "runsc",
  },
});

app.server.start();
```

### `cachePath` 的职责

`cachePath` 只用于运行时目录，例如：

- sandbox 工作目录
- GitHub bootstrap mirror
- pnpm store
- 临时文件
- skill bundle 文件

业务真相不保存在这里。完整应用的会话、消息、automation、用户与通道配置都在 MySQL。

## Backend SDK

后端 SDK 文档见：

- [packages/backend/README.md](/Users/lawkaiqing/code/amigo/packages/backend/README.md)

核心原则：

- backend 不解析 `MYSQL_HOST`、`MYSQL_PORT` 这类数据库配置
- backend 只要求应用注入 `conversationPersistenceProvider`
- 数据库实现、连接池、migration 都属于应用层
- 自定义工具可通过 `completionBehavior: "idle"` 声明“执行后结束当前回合并等待用户”

## Frontend SDK

前端 SDK 文档见：

- [packages/frontend/README.md](/Users/lawkaiqing/code/amigo/packages/frontend/README.md)

`packages/frontend` 只提供 React SDK，不负责认证、路由和后端实现。

## 生产部署

生产部署文档见：

- [docs/deploy-caddy.md](/Users/lawkaiqing/code/amigo/docs/deploy-caddy.md)

默认部署模型：

- Caddy
- systemd
- Docker + `runsc`
- MySQL
- Better Auth
