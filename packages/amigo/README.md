# @amigo-llm/amigo

`@amigo-llm/amigo` 是这个仓库里的完整应用层。

它把这些能力接在了一起：

- `@amigo-llm/backend` 会话运行时
- `@amigo-llm/frontend` React WebSocket SDK
- Better Auth 登录注册
- MySQL 持久化与 migration
- 技能管理与技能市场导入
- automations 调度
- design draft 工作流
- sandbox editor / preview 代理
- Feishu 集成
- Qdrant 长期记忆

## 入口

服务端入口：

- [`src/server/index.ts`](src/server/index.ts)
- [`src/server/app.ts`](src/server/app.ts)

前端入口：

- [`src/web/App.tsx`](src/web/App.tsx)
- [`src/web/main.tsx`](src/web/main.tsx)

## 本地启动

在仓库根目录执行：

```bash
bun install
cp packages/amigo/.env.example packages/amigo/.env
docker run -d --name amigo-qdrant -p 6333:6333 qdrant/qdrant
docker build -t ai_sandbox packages/amigo/assets
bun --filter @amigo-llm/amigo dev
```

如果你没有 MySQL，也需要先准备一个。

默认端口：

- Web: `http://localhost:3000`
- API/Auth/WS: `http://localhost:10013`

## 环境变量

最低限度需要：

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=amigo
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=amigo

BETTER_AUTH_SECRET=replace-with-a-long-random-secret
BETTER_AUTH_BASE_URL=http://localhost:10013
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

补充：

- 模型配置优先从用户设置读取
- `MODEL_API_KEY` / `MODEL_NAME` / `MODEL_BASE_URL` 仍可作为兜底
- `SERPER_API_KEY`、`GITHUB_TOKEN`、OSS、Feishu 配置都是可选项

参考：

- [`./.env.example`](./.env.example)
- [`../../ops/deploy/amigo.env.example`](../../ops/deploy/amigo.env.example)

## 默认行为

### MySQL 是必需的

`createAmigoApp()` 启动时会强制要求 MySQL 配置，并自动执行 migration。

### 默认入口会启用 Qdrant 长期记忆

`src/server/index.ts` 默认会注入一套 Qdrant memory 配置，地址固定为 `http://127.0.0.1:6333`。

### 默认会启用 LSP 工具

当前默认内置：

- TypeScript / JavaScript: `typescript-language-server`
- Python: `pyright-langserver`

这些语言服务已经预装在 [`assets/Dockerfile`](assets/Dockerfile) 对应的 sandbox 镜像里。

## 公开的应用层能力

### `createAmigoApp`

如果你想复用这个完整应用装配逻辑，可以直接从 `src/server/app.ts` 使用：

```ts
import { createAmigoApp } from "./src/server/app";

const app = await createAmigoApp({
  port: 10013,
  cachePath: "/var/lib/amigo",
  sandboxConfig: {
    imageName: "ai_sandbox",
  },
});

app.server.start();
```

它会负责装配：

- MySQL persistence provider
- auth / HTTP / WebSocket server
- skill store
- automation scheduler
- sandbox manager
- preview / editor 代理
- 用户级模型配置解析
- 可选 memory / LSP / OSS / preview host 配置

### MySQL helper

数据库相关辅助导出位于：

- [`src/server/db/index.ts`](src/server/db/index.ts)
- [`src/server/db/bootstrap.ts`](src/server/db/bootstrap.ts)

可用于：

- 创建数据库访问层
- 手动执行 migration
- bootstrap 本地 web 用户

## 生产部署样板

当前仓库内置了基础样板：

- [`../../ops/deploy/amigo.env.example`](../../ops/deploy/amigo.env.example)
- [`../../ops/systemd/amigo.service`](../../ops/systemd/amigo.service)
- [`../../ops/caddy/Caddyfile.example`](../../ops/caddy/Caddyfile.example)

常见生产形态是：

- Caddy 提供静态资源并代理 `/api/*`、`/ws*`
- Bun 只跑后端服务
- preview 可选走子域代理

## 进一步阅读

- 根说明：[`../../README.md`](../../README.md)
- backend SDK：[`../backend/README.md`](../backend/README.md)
- frontend SDK：[`../frontend/README.md`](../frontend/README.md)
