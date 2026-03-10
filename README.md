# Amigo

Amigo 是一个面向 coding / design agent 场景的 Bun monorepo，既可以直接运行完整应用，也可以把 backend / frontend 作为 SDK 接入自己的产品。

## 项目组成

- `packages/amigo`：完整应用，包含服务端入口、HTTP 路由、preview/editor wiring、前端页面和 sandbox 资产
- `packages/backend`：后端 SDK，包含会话运行时、任务编排、工具执行、sandbox 能力、conversation WebSocket runtime
- `packages/frontend`：React SDK，包含聊天窗口、输入框、状态管理、任务切换和渲染器体系
- `packages/types`：前后端共享协议与类型

## 功能概览

### 完整应用 `packages/amigo`

- 多任务对话，支持主任务 / 子任务切换
- coding agent 工具链：bash、读写文件、启动 dev server、打开 sandbox editor
- design doc 存储、读取、任务文档展示
- GitHub 仓库预热与首次 sandbox 导入
- Docker sandbox 生命周期管理
- 开发预览、preview 域名转发与 editor 跳转

### Backend SDK `@amigo-llm/backend`

- `AmigoServerBuilder`
- `defineTool()`、`defineMessage()`
- conversation WebSocket runtime
- 模型工厂注入
- 自动批准工具配置
- 追加或覆盖 system prompt
- 覆盖 `main` / `sub` 基础工具集合
- sandbox manager 注入
- 会话创建钩子
- tool preset：coding、GitHub 集成、sandbox 能力

### Frontend SDK `@amigo-llm/frontend`

- `WebSocketProvider`
- `ChatWindow`
- `MessageInput`
- hooks：`useConnection`、`useMessages`、`useSendMessage`、`useTasks`、`useMentions`、`useWebSocket`
- 默认消息 / 工具 / 错误 / 中断渲染器
- 应用层自定义 renderers 扩展

## 使用方式

### 1. 直接运行完整应用

```bash
bun install
cp packages/amigo/.env.example packages/amigo/.env
docker build -t ai_sandbox packages/amigo/assets
bun dev
```

启动后默认地址：

- 前端：`http://localhost:3000`
- 服务端 WebSocket / HTTP：`ws://localhost:10013`

### 2. 作为 backend SDK 使用

```ts
import { AmigoServerBuilder, defineTool } from "@amigo-llm/backend/sdk";

const echoTool = defineTool({
  name: "echoText",
  description: "回显输入",
  params: [{ name: "text", optional: false, description: "输入文本" }],
  async invoke({ params }) {
    return {
      message: "echo 完成",
      toolResult: { text: params.text },
    };
  },
});

const server = new AmigoServerBuilder()
  .port(10013)
  .storagePath("./storage")
  .registerTool(echoTool)
  .build();

server.start();
```

### 3. 作为 frontend SDK 使用

```tsx
import { ChatWindow, MessageInput, WebSocketProvider } from "@amigo-llm/frontend";
import "@amigo-llm/frontend/styles";

export default function App() {
  return (
    <WebSocketProvider url="ws://localhost:10013" autoConnect>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <ChatWindow />
        <MessageInput placeholder="输入需求..." />
      </div>
    </WebSocketProvider>
  );
}
```

## 职责划分

- `packages/amigo` 负责完整应用入口、HTTP 路由、preview/editor 访问路径、preview 反代和页面壳层
- `packages/backend` 负责通用 runtime、工具系统、会话系统、sandbox 能力和 conversation WebSocket
- `packages/frontend` 负责 React 聊天 UI、状态管理和可扩展渲染层

## 仓库结构

```text
amigo/
├── README.md
├── package.json
└── packages/
    ├── frontend/
    │   ├── README.md
    │   └── src/sdk/             # frontend SDK
    ├── backend/
    │   ├── README.md
    │   ├── src/appTools/        # 可复用工具预设
    │   ├── src/core/            # 会话、模型、sandbox、conversation runtime
    ├── amigo/
    │   ├── assets/              # 主 app 的 sandbox Dockerfile、code-server 扩展
    │   ├── src/server/          # 主 app 服务端入口、HTTP 路由、preview/editor wiring
    │   └── src/web/             # 主 app 前端壳
    ├── swebench/
    │   ├── README.md
    │   └── assets/              # sandbox Dockerfile、code-server 扩展
    │   └── src/                 # 独立 SWE-bench server profile 与 headless runner
    └── types/
```

## 环境要求

- Bun 1.x
- Node.js 18+
- Docker

如果你要启用 sandbox：

- macOS 本地开发：Docker Desktop 即可
- Linux 部署：除了 Docker，还需要安装并注册 `runsc`（gVisor runtime）

## 快速开始

### 1. 安装依赖

```bash
bun install
cp packages/amigo/.env.example packages/amigo/.env
```

### 2. 填写服务端环境变量

最少需要配置：

```env
MODEL_API_KEY=your_api_key
MODEL_NAME=qwen3-coder
MODEL_BASE_URL=https://openrouter.ai/api/v1
```

其余变量见 [`packages/amigo/.env.example`](./packages/amigo/.env.example)。

### 3. 构建 sandbox 镜像

主 app 默认使用 `AMIGO_SANDBOX_IMAGE` 指定的镜像；未配置时回退到 `ai_sandbox`：

```bash
docker build -t ai_sandbox packages/amigo/assets
```

SWE-bench 使用独立镜像：

```bash
docker build -t amigo-swe -f packages/swebench/assets/Dockerfile .
```

### 4. 启动

在仓库根目录执行：

```bash
bun dev
```

默认情况下：

- 前端：`http://localhost:3000`
- 服务端 WebSocket / HTTP：`ws://localhost:10013`

也可以分开启动：

```bash
bun --filter @amigo-llm/amigo start:server
bun --filter @amigo-llm/amigo start:web
```

## 常用命令

```bash
bun dev
bun run build
bun run lint
bun run lint:fix

bun --filter @amigo-llm/backend test
bun --filter @amigo-llm/backend build
bun --filter @amigo-llm/frontend build
bun --filter @amigo-llm/amigo build
bun --filter @amigo-llm/swebench start
bun --filter @amigo-llm/swebench run --dataset /path/to/instances.jsonl --limit 1
```

## 配置说明

### 必填

| 变量 | 说明 |
| --- | --- |
| `MODEL_API_KEY` | LLM API Key |

### 模型

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MODEL_NAME` | `qwen3-coder` | 模型名；服务端会按内置 provider 规则解析 |
| `MODEL_BASE_URL` | `https://openrouter.ai/api/v1` | OpenAI-compatible base URL |
| `LLM_TEMPERATURE` | `0` | 采样温度 |
| `MODEL_CONTEXT_CONFIGS` | - | 按模型手动配置上下文窗口与自动压缩阈值，JSON 格式，例如 `{"qwen3-coder":{"contextWindow":262144,"compressionThreshold":0.8,"targetRatio":0.5}}` |

### 服务端

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SERVER_PORT` | `10013` | Bun 服务端口 |
| `STORAGE_PATH` | `./storage` | 会话、设计稿、Penpot 绑定等存储目录 |
| `LOG_LEVEL` | `INFO` | 日志级别 |

### Sandbox / Preview

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `AMIGO_SANDBOX_MEMORY_MB` | `2048` | 每个 sandbox 容器内存上限 |
| `AMIGO_PREVIEW_BASE_DOMAIN` | - | 用于对外暴露 Preview 的通配域名，例如 `preview.example.com` |
| `AMIGO_PREVIEW_PUBLIC_PROTOCOL` | `https` | Preview 外链协议 |

### 搜索

| 变量 | 说明 |
| --- | --- |
| `SERPER_API_KEY` | `browserSearch` 优先走 SERPER，没有则回退 HTML 抓取 |

### OSS 附件上传

| 变量 | 说明 |
| --- | --- |
| `OSS_ENDPOINT` | OSS endpoint |
| `OSS_BUCKET` | bucket 名称 |
| `OSS_ACCESS_KEY_ID` | AccessKey ID |
| `OSS_ACCESS_KEY_SECRET` | AccessKey Secret |
| `OSS_PUBLIC_BASE_URL` | 可选，自定义附件公网访问地址 |
| `OSS_UPLOAD_PREFIX` | 可选，默认 `uploads` |
| `OSS_POLICY_EXPIRE_SECONDS` | 可选，默认 `600` |
| `OSS_SECURITY_TOKEN` | 可选，STS 场景使用 |

### Penpot

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PENPOT_BASE_URL` | `http://localhost:9001` | Penpot 实例地址 |
| `PENPOT_ACCESS_TOKEN` | - | 访问 Penpot RPC 的 token |
| `PENPOT_TEAM_ID` | - | 新建 / 更新 Penpot 文件时需要 |
| `PENPOT_PROJECT_ID` | - | 新建 / 更新 Penpot 文件时需要 |

## 部署建议

### 推荐拓扑

- 前端：静态构建后用 Nginx / Caddy 托管
- 服务端：直接跑在 Linux 主机上，由 systemd 管理
- Docker / gVisor：与服务端同机，供 sandbox 使用
- Penpot：单独部署或接入现有实例

不推荐把 `packages/amigo/src/server` 再包进 Docker 里部署，原因是它本身还要去管理宿主机 Docker、绑定本机随机端口、拉起 sandbox 容器，复杂度会明显上升。

### 前端和服务端的网络约束

当前应用层前端写死了这一条连接规则：

- 本地：`ws://<hostname>:10013`
- 非 localhost：`wss://<hostname>:10013`

这意味着如果你不改 [`packages/amigo/src/web/App.tsx`](./packages/amigo/src/web/App.tsx)，生产环境需要满足：

1. 前端页面和服务端使用同一个 hostname
2. `10013` 端口对浏览器可访问
3. 非本地部署时，`10013` 端口前面要有 TLS 终止和 WebSocket 转发

如果你想把 WebSocket 也收敛到 `443`，需要改前端连接地址逻辑，或者直接基于 frontend SDK 自己做一层应用壳。

## Sandbox 部署

### 本地开发

本地开发最简单：

1. 安装 Docker Desktop
2. 构建镜像：`docker build -t ai_sandbox packages/amigo/assets`
3. 启动服务端

macOS 下代码会直接使用 `runc`，不需要额外配置 `runsc`。

### Linux 生产环境

当前代码在非 macOS 环境下会把 Docker runtime 设为 `runsc`。也就是说，Linux 机器上如果没有 gVisor，sandbox 创建会直接失败。

你需要：

1. 安装 Docker Engine
2. 安装 gVisor，并确认 `runsc` 可执行
3. 在 Docker daemon 中注册 `runsc` runtime
4. 构建 sandbox 镜像（默认 tag 可用 `ai_sandbox`，也可配合 `AMIGO_SANDBOX_IMAGE` 自定义）

如果你不打算使用 gVisor，而是继续用 `runc`，需要修改 [`packages/backend/src/core/sandbox/index.ts`](./packages/backend/src/core/sandbox/index.ts) 里的 runtime 选择逻辑。

### Sandbox 镜像要求

当前镜像至少需要包含：

- `git`
- `python3`
- 基础编译工具
- `code-server`
- 常用 JS 包管理器 / 运行时

仓库已经提供了可直接使用的 Dockerfile：

- [`packages/amigo/assets/Dockerfile`](./packages/amigo/assets/Dockerfile)

### 数据持久化

建议把 `STORAGE_PATH` 配置到持久磁盘，例如：

```env
STORAGE_PATH=/var/lib/amigo/storage
```

因为除了 `storage` 本身，sandbox 还会在它的同级目录写入内部缓存：

- `.amigo/github-bootstrap/mirrors`
- `.amigo/pnpm-store`

最稳妥的做法是把 `/var/lib/amigo` 整个目录都做持久化。

### Preview 和 Editor 的差异

- Preview：支持通过 `AMIGO_PREVIEW_BASE_DOMAIN` 做通配子域名代理，适合公网访问
- Editor：当前是直接跳转到宿主机上随机分配的 `code-server` 端口，更适合本机、内网或 SSH 隧道场景

也就是说：

- 想让 Preview 对外可用，配置通配 DNS + 反向代理到 Bun 服务即可
- 想让 Editor 也对公网稳定可用，当前实现还不算完整，最好放在内网环境使用

### Preview 通配域名配置

假设：

- 主站：`amigo.example.com`
- Preview 通配域名：`*.preview.example.com`
- Bun 服务监听：`127.0.0.1:10013`

则推荐：

```env
AMIGO_PREVIEW_BASE_DOMAIN=preview.example.com
AMIGO_PREVIEW_PUBLIC_PROTOCOL=https
```

然后把：

- `preview.example.com`
- `*.preview.example.com`

都反向代理到同一个 Bun 服务。服务端会根据子域名里的 `sandboxId` 自动转发到对应 sandbox 的 dev server。

## Penpot 配置

### 最小要求

如果你希望：

- `editDesignDoc` 保存后自动同步到 Penpot
- 在设计页里查看绑定、轮询远端状态、从 Penpot 反向回写

至少要配置：

```env
PENPOT_BASE_URL=https://penpot.example.com
PENPOT_ACCESS_TOKEN=your_penpot_token
PENPOT_TEAM_ID=team_id
PENPOT_PROJECT_ID=project_id
```

### 这些变量分别做什么

- `PENPOT_BASE_URL`：Penpot 实例根地址
- `PENPOT_ACCESS_TOKEN`：所有 RPC 读写都需要
- `PENPOT_TEAM_ID`、`PENPOT_PROJECT_ID`：创建 Penpot 文件、把 design doc 正向同步到 Penpot 时需要

如果只做“读取已绑定文件并回写到 design doc”，token 仍然必需；但没有 `teamId/projectId` 时，首次创建或覆盖同步会失败。

### 如何拿到 teamId / projectId / fileId / pageId

- `teamId`、`projectId`：从 Penpot 工作台 URL 的 hash 参数里拿
- `fileId`、`pageId`：绑定现有页面时，前端保存的也是 Penpot workspace URL，服务端会从 hash 参数中解析

格式类似：

```text
https://penpot.example.com/#/workspace?team-id=...&project-id=...&file-id=...&page-id=...
```

### 运行方式

设计稿相关链路大致是：

1. agent 用 `editDesignDoc` / `readDesignDoc` 操作 design doc
2. `editDesignDoc` 保存后尝试自动同步到 Penpot
3. 前端设计页会轮询 Penpot 远端 revision
4. 发现 Penpot 有新 revision 时，可自动或手动回写到 design doc

## SDK 文档

- Backend SDK: [`packages/backend/README.md`](./packages/backend/README.md)
- Frontend SDK: [`packages/frontend/README.md`](./packages/frontend/README.md)

## 生产启动建议

### 构建

```bash
bun run build
```

### 服务端

在 `packages/amigo` 下准备好 `.env` 后，可以直接用构建产物启动：

```bash
bun packages/amigo/dist/server/index.js
```

建议再配上 systemd，确保自动重启。

### 前端

```bash
bun --filter @amigo-llm/frontend build
```

构建产物在 `packages/frontend/dist/`，可交给 Nginx / Caddy 托管。

## 注意事项

- 不要把真实 `.env` 和密钥提交到仓库
- `MODEL_NAME` 必须能命中服务端 provider 映射规则，否则启动会失败
- sandbox 镜像名可通过 `AMIGO_SANDBOX_IMAGE` 或应用自己注入的 `SandboxRegistry` 配置，默认回退到 `ai_sandbox`
- 生产环境若使用 HTTPS 页面，WebSocket 侧也必须是 `wss`
- 附件上传依赖 OSS；未配置时，聊天仍可用，但上传按钮会失败
