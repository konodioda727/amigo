# Amigo

Amigo 是一个面向 coding agent / design agent 场景的 Bun monorepo。

这个仓库有两种用法：

- 直接运行完整应用：使用 `packages/amigo`
- 把能力拆开接入自己的产品：使用 `packages/backend` 和 `packages/frontend`

## 仓库结构

- `packages/amigo`
  完整应用。包含服务端入口、应用层 HTTP 路由、前端页面、editor/preview 暴露策略、sandbox 资产。
- `packages/backend`
  后端 SDK。包含会话运行时、工具执行、sandbox 生命周期、conversation WebSocket runtime。
- `packages/frontend`
  React SDK。包含 `ChatWindow`、`MessageInput`、状态管理和默认渲染器。
- `packages/types`
  前后端共享协议和类型。

## 配置原则

这套仓库现在按下面的边界工作：

- backend SDK 代码配置：
  `port`、`cachePath`、`loggerConfig`、`modelConfigs`、`sandboxConfig`
- app 层代码配置：
  `previewHostConfig`
- 环境变量：
  `MODEL_API_KEY`、`MODEL_NAME`、`MODEL_BASE_URL`、`LLM_TEMPERATURE`、`SERPER_API_KEY`、`OSS_*`、`PENPOT_*`

也就是说：

- 非敏感、属于运行时拓扑/行为的配置，优先在代码里传
- 含密钥或明显属于部署机密的配置，放 env

`modelConfigs` 明确只走代码，不读 env。
`previewHostConfig` 只属于 `packages/amigo` 这层 HTTP app，不属于 backend SDK。

## 快速开始

### 前置要求

- Bun 1.x
- Node.js 18+
- Docker

如果你要启用 sandbox：

- macOS：Docker Desktop 即可
- Linux：需要 Docker + `runsc`（gVisor runtime）

### 1. 安装依赖

```bash
bun install
cp packages/amigo/.env.example packages/amigo/.env
```

### 2. 配置最小 env

完整应用默认 LLM 配置仍然从 env 读取。最少需要：

```env
MODEL_API_KEY=your_api_key
MODEL_NAME=qwen3-coder
MODEL_BASE_URL=https://openrouter.ai/api/v1
```

如果你要用搜索、OSS 或 Penpot，再补对应密钥。

如果你希望 sandbox 里的仓库可以直接 `git push` 到 GitHub，再补：

```env
GITHUB_TOKEN=ghp_xxx
```

参考：

- [packages/amigo/.env.example](/Users/lawkaiqing/code/amigo/packages/amigo/.env.example)

### 3. 构建 sandbox 镜像

```bash
docker build -t ai_sandbox packages/amigo/assets
```

该镜像会预装 `bash`、`bun`、`deno`、`pnpm` 和 `code-server`，其中 `npm` registry 默认指向淘宝镜像源，且只用于安装 `pnpm`；其余常用 JS 工具通过 `pnpm` 安装，供 `/sandbox` 内的项目直接使用。

### 4. 启动开发环境

```bash
bun dev
```

默认地址：

- 前端：`http://localhost:3000`
- 服务端：`ws://localhost:10013`

也可以拆开启动：

```bash
bun --filter @amigo-llm/amigo start:server
bun --filter @amigo-llm/amigo start:web
```

## 完整应用如何配置

完整应用入口在 [packages/amigo/src/server/app.ts](/Users/lawkaiqing/code/amigo/packages/amigo/src/server/app.ts)。

推荐这样理解：

- `createAmigoApp(...)` 负责非敏感运行时配置
- `.env` 负责密钥和外部服务凭据

示例：

```ts
import { createAmigoApp } from "./src/server/app";

const app = createAmigoApp({
  port: 10013,
  cachePath: "/var/lib/amigo",
  loggerConfig: { level: 1 },
  modelConfigs: {
    "doubao-seed-2.0-code": {
      provider: "openai-compatible",
      baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
      contextWindow: 4728,
      compressionThreshold: 0.8,
      targetRatio: 0.5,
    },
  },
  sandboxConfig: {
    imageName: "ai_sandbox",
  },
});

app.server.start();
```

### cachePath 目录语义

运行时会把持久化内容统一写到 `cachePath` 下：

- `${cachePath}/storage`
  会话、设计稿、Penpot 绑定、任务文档
- `${cachePath}/pnpm-store`
  sandbox 共享 pnpm store
- `${cachePath}/github-bootstrap`
  GitHub bootstrap mirror

如果你做生产部署，直接把整个 `cachePath` 所在目录挂到持久盘，不要再单独拆 `storage`。

## env 里到底该放什么

### 必填

- `MODEL_API_KEY`

### 通常保留在 env 的项

- `MODEL_NAME`
- `MODEL_BASE_URL`
- `LLM_TEMPERATURE`
- `SERPER_API_KEY`
- `OSS_ACCESS_KEY_ID`
- `OSS_ACCESS_KEY_SECRET`
- `OSS_SECURITY_TOKEN`
- `PENPOT_BASE_URL`
- `PENPOT_ACCESS_TOKEN`
- `PENPOT_TEAM_ID`
- `PENPOT_PROJECT_ID`

### 明确不应该放 env 的项

- `port`
- `cachePath`
- `loggerConfig`
- `modelConfigs`
- `sandboxConfig`

完整应用额外还有：

- `previewHostConfig`

它属于 app 层 HTTP 暴露策略，只在 `createAmigoApp(...)` 里配置。

## Backend SDK

后端 SDK 文档见：

- [packages/backend/README.md](/Users/lawkaiqing/code/amigo/packages/backend/README.md)

一个最小例子：

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
  .cachePath("./.amigo")
  .loggerConfig({ level: 1 })
  .modelConfigs({
    "qwen3-coder": {
      provider: "openai-compatible",
      baseURL: "https://openrouter.ai/api/v1",
      contextWindow: 262144,
      compressionThreshold: 0.8,
      targetRatio: 0.5,
    },
  })
  .registerTool(echoTool)
  .build();

server.start();
```

说明：

- `modelConfigs()` 只走代码配置
- 如果你不想用 env 驱动模型创建，可以直接注入 `llmFactory()` / `modelProvider()`

## Frontend SDK

前端 SDK 文档见：

- [packages/frontend/README.md](/Users/lawkaiqing/code/amigo/packages/frontend/README.md)

一个最小例子：

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

## Sandbox 与部署

### 本地开发

最简单的方式：

1. 安装 Docker Desktop
2. `docker build -t ai_sandbox packages/amigo/assets`
3. `bun dev`

macOS 默认使用 `runc`。

### Linux 生产

当前默认逻辑在 Linux 下会使用 `runsc`。如果你的机器没有 gVisor，sandbox 创建会失败。

生产机至少要有：

1. Docker Engine
2. `runsc`
3. Docker daemon 已注册 `runsc` runtime
4. 预先构建好的 sandbox 镜像

如果你不想使用 gVisor，就在代码里显式传：

```ts
createAmigoApp({
  sandboxConfig: {
    runtime: "runc",
  },
});
```

### Preview

Preview 适合对外暴露 dev server，Editor 更适合本机、内网或 SSH 隧道场景。

这部分能力属于 `packages/amigo` 的 app 层 HTTP 组装，不属于 `@amigo-llm/backend` SDK。本质上是应用在 sandbox dev server 之外，再补一层对外暴露与反代策略。

如果你要做 preview 通配子域名：

```ts
createAmigoApp({
  previewHostConfig: {
    baseDomain: "preview.example.com",
    publicProtocol: "https",
  },
});
```

然后把：

- `preview.example.com`
- `*.preview.example.com`

都反向代理到同一个 Bun 服务。

## Penpot

如果你要启用 design doc <-> Penpot 同步，至少需要：

```env
PENPOT_BASE_URL=https://penpot.example.com
PENPOT_ACCESS_TOKEN=your_penpot_token
PENPOT_TEAM_ID=team_id
PENPOT_PROJECT_ID=project_id
```

语义：

- `PENPOT_BASE_URL`
  Penpot 实例地址
- `PENPOT_ACCESS_TOKEN`
  RPC 调用凭据
- `PENPOT_TEAM_ID` / `PENPOT_PROJECT_ID`
  新建文件和正向同步所需

如果只做反向读取，`teamId/projectId` 可以缺，但 `accessToken` 仍然必需。

## OSS

如果你要启用附件上传，需要配置：

```env
OSS_ACCESS_KEY_ID=your-access-key-id
OSS_ACCESS_KEY_SECRET=your-access-key-secret
```

可选项：

- `OSS_ENDPOINT`
- `OSS_BUCKET`
- `OSS_PUBLIC_BASE_URL`
- `OSS_UPLOAD_PREFIX`
- `OSS_POLICY_EXPIRE_SECONDS`
- `OSS_SECURITY_TOKEN`

这部分保留 env 是因为它本质上是部署密钥，不应该被运行时代码配置替代。

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
```

## 注意事项

- 不要把真实 `.env` 提交到仓库
- `MODEL_NAME` 必须能命中 provider 解析规则，否则启动会失败
- `modelConfigs` 只认代码配置
- `OSS_*` 和 `PENPOT_*` 属于机密配置，建议走 env
- 生产环境若页面是 HTTPS，WebSocket 也必须是 `wss`
