<div align="center">
  <img width="120" src="https://cdn.jsdelivr.net/gh/amigo-llc/amigo@main/assets/logo.svg" alt="Amigo Logo" />
  <h1>Amigo</h1>
  <p>面向 coding agent / design agent 的下一代开发框架，开箱即用的 AI 应用构建底座</p>

[![Bun 1.x](https://img.shields.io/badge/Bun-1.x-f9f1e1?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License MIT](https://img.shields.io/badge/License-MIT-blueviolet?style=flat)](/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat)](/CONTRIBUTING.md)

</div>

---

## 📚 仓库分层设计
Amigo 采用 Monorepo 架构，清晰分离核心能力与业务实现：

| 包位置 | 职责说明 | 适用场景 |
|--------|----------|----------|
| `packages/backend` | 通用后端 SDK，负责会话运行时、工具执行、消息协议、任务编排和持久化抽象 | 你要把会话引擎接入自己的产品 |
| `packages/amigo` | 完整应用实现，包含 MySQL、Better Auth、HTTP 路由、飞书集成、automation、skills、设计文档和前端页面 | 你只想直接运行完整产品 |
| `packages/frontend` | React SDK，负责 WebSocket 状态管理、聊天窗口、消息输入框、默认渲染器 | 你需要自定义前端交互 |
| `packages/types` | 前后端共享协议和类型定义 | 你要开发自定义插件/扩展 |

---

## 🏗️ 架构边界
这套仓库按明确的职责边界工作：
- ✅ `backend` 负责会话引擎和持久化接口，不感知具体数据库实现
- ✅ `app` 负责数据库连接、migration、认证、渠道、HTTP 路由和产品功能
- ✅ 完整应用使用 MySQL 作为唯一业务真相源
- ✅ `cachePath` / `.amigo` 只保留运行时资产和缓存，不承载业务数据

> 对 `packages/amigo` 来说，MySQL 是必需的。服务启动时会自动校验配置、执行 migration、初始化应用所需表结构。

---

## 🚀 快速开始

### 📋 前置要求
- Bun 1.x
- Node.js 18+
- Docker
- MySQL 8+

如果需要启用 sandbox 能力：
- macOS: Docker Desktop
- Linux: Docker + `runsc`

---

### 1. 安装依赖 & 初始化配置
```bash
# 安装全部依赖
bun install
# 复制环境变量模板
cp packages/amigo/.env.example packages/amigo/.env
```

---

### 2. 配置环境变量
最少需要配置以下项：
```env
# 数据库配置
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=amigo
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=amigo

# 认证配置
BETTER_AUTH_SECRET=replace_with_a_long_random_secret
BETTER_AUTH_BASE_URL=http://localhost:10013
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

> 💡 模型相关配置现在默认走前端登录后的 `/models` 页面配置，不再要求在 `.env` 中填写 `MODEL_API_KEY`、`MODEL_NAME`、`MODEL_BASE_URL`，旧的兜底配置方式仍然兼容。

参考：[packages/amigo/.env.example](/packages/amigo/.env.example)

---

### 3. 准备数据库
应用会自动建表和执行 migration，但数据库本身需要先存在：
```sql
CREATE DATABASE amigo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'amigo'@'localhost' IDENTIFIED BY 'your_mysql_password';
GRANT ALL PRIVILEGES ON amigo.* TO 'amigo'@'localhost';
FLUSH PRIVILEGES;
```

---

### 4. 构建 sandbox 镜像
```bash
docker build -t ai_sandbox packages/amigo/assets
```

---

### 5. 启动开发环境
```bash
# 全量启动前端+后端
bun dev
```

默认访问地址：
- 前端页面: `http://localhost:3000`
- 服务端接口: `http://localhost:10013`
- WebSocket 通道: `ws://localhost:10013/ws`

也可以分开启动：
```bash
# 只启动后端
bun --filter @amigo-llm/amigo dev:server
# 只启动前端
bun --filter @amigo-llm/amigo dev:web
```

---

## 📦 完整应用说明
完整应用入口在 [packages/amigo/src/server/app.ts](/packages/amigo/src/server/app.ts)

`packages/amigo` 负责：
- 读取 MySQL 和 Better Auth 配置
- 创建 MySQL 连接池
- 执行 migration
- 创建 MySQL 持久化 provider
- 注入 backend SDK
- 提供 HTTP / WebSocket / Auth / automation / skills / 飞书集成等能力

你可以这样理解：
- `createAmigoApp(...)` 负责运行时装配
- `.env` 负责部署机密和外部服务凭据

使用示例：
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

---

### 🗂️ `cachePath` 职责
`cachePath` 只用于运行时临时目录，例如：
- sandbox 工作目录
- GitHub bootstrap 镜像
- pnpm store
- 临时文件
- skill bundle 文件

> 🔴 业务真相不保存在这里。完整应用的会话、消息、automation、用户与通道配置都存储在 MySQL 中。

---

## 🛠️ Backend SDK
后端 SDK 完整文档见：[packages/backend/README.md](/packages/backend/README.md)

核心设计原则：
- backend 不解析 `MYSQL_HOST`、`MYSQL_PORT` 这类数据库配置
- backend 只要求应用注入 `conversationPersistenceProvider`
- 数据库实现、连接池、migration 都属于应用层
- 自定义工具可通过 `completionBehavior: "idle"` 声明“执行后结束当前回合并等待用户”

---

## 🎨 Frontend SDK
前端 SDK 完整文档见：[packages/frontend/README.md](/packages/frontend/README.md)

`packages/frontend` 只提供 React SDK，不负责认证、路由和后端实现。

---

## 🌐 生产部署
生产部署完整文档见：[docs/deploy-caddy.md](/docs/deploy-caddy.md)

默认部署栈：
- Caddy（反向代理 + SSL）
- systemd（进程管理）
- Docker + `runsc`（沙箱运行时）
- MySQL（数据存储）
- Better Auth（认证体系）

---

<div align="center">
Made with ❤️ by Amigo Team
</div>