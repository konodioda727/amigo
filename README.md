# Amigo

Amigo 是一个面向 coding agent / design agent 的 monorepo。

这个仓库同时包含三层能力：

- 一个可嵌入的后端会话运行时 SDK
- 一个可复用的 React WebSocket 前端 SDK
- 一个已经接好认证、数据库、自动化、技能、设计稿工作流和 sandbox 的完整应用

## 这个仓库现在是什么

当前代码库的职责边界已经比较明确：

| 包 | 作用 | 适合谁 |
| --- | --- | --- |
| `packages/backend` | 会话引擎、任务编排、工具系统、sandbox 抽象、WebSocket runtime、记忆与持久化接口 | 你要把 agent runtime 接进自己的产品 |
| `packages/frontend` | React SDK，负责 WebSocket 状态管理、聊天窗口、输入框、默认消息渲染器 | 你要复用现成聊天交互，但自己做产品外壳 |
| `packages/types` | 前后端共享协议、工具类型、WebSocket 消息定义 | 你要扩展协议或自定义工具 |
| `packages/amigo` | 完整应用，包含认证、MySQL 持久化、HTTP API、技能、自动化、设计稿能力、沙箱编辑器/预览代理、飞书集成 | 你想直接跑一个可用产品 |

## 当前架构总览

```text
Browser / React App
  └─ packages/amigo/src/web
       ├─ 登录注册
       ├─ Chat / Skills / Automations / Drafts 页面
       └─ @amigo-llm/frontend WebSocket SDK

Bun App Server
  └─ packages/amigo/src/server
       ├─ Better Auth
       ├─ HTTP API
       ├─ /ws 会话通道
       ├─ sandbox preview / editor 代理
       └─ createAmigoApp(...)

Conversation Runtime
  └─ packages/backend
       ├─ task / subtask orchestration
       ├─ tools
       ├─ sandbox lifecycle
       ├─ memory
       └─ persistence abstraction

External Services
  ├─ MySQL: 用户、认证、会话、消息、skills、automations、documents、模型配置
  ├─ Qdrant: 长期记忆向量存储
  ├─ Docker sandbox: 编码、预览、code-server、LSP
  └─ Optional: GitHub / OSS / Feishu / browser search
```

## 完整应用现在提供的能力

`packages/amigo` 不再只是一个简单 demo，而是完整产品层：

- 邮箱注册 / 登录，基于 Better Auth
- 多用户会话、消息、任务树与 WebSocket 实时同步
- 用户级模型配置与默认模型选择
- 技能管理与技能市场导入
- automation 创建、调度、执行与通知通道
- design session / layout options / theme options / final draft 工作流
- sandbox 内代码执行、预览代理、code-server 编辑器代理
- TypeScript / Python LSP 诊断、跳转定义、查找引用
- Qdrant-backed 长期记忆
- Feishu 集成与通知发送

## 数据边界

当前仓库里最容易写错的地方就是数据职责边界，明确一下：

- MySQL 是 `packages/amigo` 的业务真相源
- `cachePath` 或 `.amigo` 只保存运行时缓存和沙箱资产，不是业务数据库
- Qdrant 只负责长期记忆向量检索，不替代会话持久化

在默认实现里，MySQL 会保存：

- 用户、租户、认证会话
- conversations / messages / conversation state
- automations / automation runs
- documents
- skills 及其元数据
- notification channels
- user model configs

`cachePath` 主要用于：

- sandbox 工作目录
- code-server / preview 运行时目录
- skills 本地 bundle 副本
- 临时文件与缓存

## 本地开发

### 前置依赖

建议至少准备：

- Bun 1.x
- Docker
- MySQL 8+
- Qdrant

说明：

- 对 `packages/amigo` 来说，MySQL 是必需项
- 仓库默认服务端入口 `packages/amigo/src/server/index.ts` 会启用 Qdrant 长期记忆配置，默认地址是 `http://127.0.0.1:6333`
- sandbox 在 macOS 默认走 `runc`，Linux 默认走 `runsc`

### 1. 安装依赖

```bash
bun install
cp packages/amigo/.env.example packages/amigo/.env
```

### 2. 启动 MySQL 和 Qdrant

如果你本地还没有服务，可以先直接用 Docker：

```bash
docker run -d \
  --name amigo-mysql \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=amigo \
  -e MYSQL_USER=amigo \
  -e MYSQL_PASSWORD=amigo \
  mysql:8.4
```

```bash
docker run -d \
  --name amigo-qdrant \
  -p 6333:6333 \
  qdrant/qdrant
```

如果你已经有自己的 MySQL，只需要提前创建数据库和账号即可。

### 3. 配置环境变量

至少要把下面这些值填上：

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=amigo
MYSQL_PASSWORD=amigo
MYSQL_DATABASE=amigo

BETTER_AUTH_SECRET=replace-with-a-long-random-secret
BETTER_AUTH_BASE_URL=http://localhost:10013
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

补充说明：

- 模型配置现在优先走登录后的用户设置，不强制要求把 `MODEL_API_KEY` / `MODEL_NAME` / `MODEL_BASE_URL` 写进 `.env`
- 旧的 `MODEL_*` 方式仍可作为兜底配置
- `SERPER_API_KEY`、`GITHUB_TOKEN`、OSS、Feishu 都是可选项

参考文件：

- [`packages/amigo/.env.example`](packages/amigo/.env.example)
- [`ops/deploy/amigo.env.example`](ops/deploy/amigo.env.example)

### 4. 构建 sandbox 镜像

完整应用默认会使用名为 `ai_sandbox` 的镜像：

```bash
docker build -t ai_sandbox packages/amigo/assets
```

这个镜像里已经包含：

- Node / Bun / pnpm / Python
- `typescript-language-server`
- `pyright-langserver`
- `code-server`

如果你要自定义镜像，至少要保留这些能力，否则编辑器、预览或语言智能工具会退化。

### 5. 启动开发环境

```bash
bun dev
```

默认端口：

- Web 前端: `http://localhost:3000`
- Bun 服务端: `http://localhost:10013`
- WebSocket: `ws://localhost:10013/ws`

也可以拆开启动：

```bash
bun --filter @amigo-llm/amigo dev:server
bun --filter @amigo-llm/amigo dev:web
```

### 6. 首次使用

开发环境第一次跑起来后：

1. 打开 `http://localhost:3000/register`
2. 注册一个本地账号
3. 登录后在设置面板里配置模型
4. 开始创建任务、管理 skills 或 automations

## 常用命令

```bash
# 根仓库
bun dev
bun build
bun lint
bun lint:fix

# 完整应用
bun --filter @amigo-llm/amigo dev
bun --filter @amigo-llm/amigo build
bun --filter @amigo-llm/amigo start

# SDK 包
bun --filter @amigo-llm/backend test
bun --filter @amigo-llm/frontend test
```

## 你应该从哪里看代码

如果你刚接手这个仓库，建议按这个顺序读：

### 完整应用入口

- [`packages/amigo/src/server/index.ts`](packages/amigo/src/server/index.ts)
- [`packages/amigo/src/server/app.ts`](packages/amigo/src/server/app.ts)
- [`packages/amigo/src/server/runtime/appServer.ts`](packages/amigo/src/server/runtime/appServer.ts)
- [`packages/amigo/src/server/http/appHttpHandler.ts`](packages/amigo/src/server/http/appHttpHandler.ts)
- [`packages/amigo/src/web/App.tsx`](packages/amigo/src/web/App.tsx)

### 后端 SDK 入口

- [`packages/backend/src/sdk.ts`](packages/backend/src/sdk.ts)
- [`packages/backend/src/core/conversation`](packages/backend/src/core/conversation)
- [`packages/backend/src/core/tools`](packages/backend/src/core/tools)
- [`packages/backend/src/core/sandbox`](packages/backend/src/core/sandbox)

### 应用层关键模块

- `auth`: Better Auth 配置
- `db`: MySQL 连接、迁移、Drizzle schema、conversation persistence provider
- `appTools`: coding / design / automation 相关扩展工具
- `skills`: 用户技能存储与技能市场接入
- `automations`: 调度与执行
- `integrations`: Feishu 等外部渠道

## 默认行为和容易踩坑的地方

### 1. 默认服务端入口会启用长期记忆

`packages/amigo/src/server/index.ts` 默认写死了 Qdrant memory 配置：

- 地址: `http://127.0.0.1:6333`
- collection prefix: `amigo_memory`
- long-term memory: enabled

所以如果你直接使用仓库内置入口，最好把 Qdrant 一起跑起来。

### 2. MySQL migration 会在启动时自动执行

应用启动时会：

- 校验 MySQL 配置
- 初始化连接池
- 确保 schema 存在
- 执行 migration
- 预热用户模型配置缓存

数据库本身要先存在，但表结构不需要手工创建。

### 3. 前端和后端在开发环境是分开的

- `bun dev` 会同时起 `dev:server` 和 `dev:web`
- 前端静态资源由 `packages/amigo/src/web/dev.ts` 提供，默认跑在 3000
- 服务端 API、认证和 WebSocket 走 10013

### 4. 生产环境通常不是 `bun start` 这种同机双端口形态

仓库当前的生产样板更接近：

- Caddy 负责静态文件和反向代理
- Bun 只跑后端服务
- 前端产物直接部署为静态文件
- preview 可选走子域代理

可参考：

- [`ops/caddy/Caddyfile.example`](ops/caddy/Caddyfile.example)
- [`ops/systemd/amigo.service`](ops/systemd/amigo.service)

## 构建与部署

根仓库构建命令：

```bash
bun build
```

关键产物位于：

- `packages/amigo/dist/web`
- `packages/amigo/dist/server`
- `packages/amigo/dist/data`
- `packages/amigo/assets`

部署时常见环境变量：

- `AMIGO_PORT`
- `AMIGO_CACHE_PATH`
- `AMIGO_SANDBOX_IMAGE`
- `AMIGO_SANDBOX_RUNTIME`
- `AMIGO_SANDBOX_MEMORY_MB`
- `AMIGO_PREVIEW_BASE_DOMAIN`
- `AMIGO_PREVIEW_PUBLIC_PROTOCOL`
- `MYSQL_*`
- `BETTER_AUTH_*`

## 如果你不想跑完整应用

这个仓库也支持拆开用：

- 只想接会话引擎：看 [`packages/backend/README.md`](packages/backend/README.md)
- 只想复用聊天前端 SDK：看 [`packages/frontend/README.md`](packages/frontend/README.md)
- 只想看完整应用封装：看 [`packages/amigo/README.md`](packages/amigo/README.md)

## 相关文档

- [`packages/backend/README.md`](packages/backend/README.md)
- [`packages/frontend/README.md`](packages/frontend/README.md)
- [`packages/amigo/README.md`](packages/amigo/README.md)
