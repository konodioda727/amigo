# @amigo-llm/backend

`@amigo-llm/backend` 是 Amigo 的后端 SDK，提供会话运行时、任务编排、工具系统、sandbox 能力和 conversation WebSocket runtime。

它适合用来构建：

- headless agent 服务
- benchmark / batch runner
- 带自定义工具和消息协议的 coding agent
- 由应用自己托管 HTTP 路由和页面壳层的完整产品

如果你是在外部项目里扩展 Amigo，优先使用：

```ts
import {
  AmigoServerBuilder,
  defineMessage,
  defineTool,
  type SandboxManager,
} from "@amigo-llm/backend/sdk";
```

## 安装

```bash
bun add @amigo-llm/backend @amigo-llm/types zod
```

运行时基于 Bun，建议直接在 Bun 环境下使用。

## 快速开始

```ts
import { AmigoServerBuilder } from "@amigo-llm/backend/sdk";

const server = new AmigoServerBuilder()
  .port(10013)
  .storagePath("./storage")
  .build();

server.start();
```

同时提供 `server.init()`，推荐统一使用 `server.start()`。

这会启动一个 headless conversation WebSocket runtime。应用可以在自己的 `Bun.serve(...)` 里接入这个 runtime，再补充自己的 HTTP 路由、editor 跳转、preview 路由或 preview 代理。

例如：

```ts
import Bun from "bun";
import { AmigoServerBuilder } from "@amigo-llm/backend/sdk";

const runtime = new AmigoServerBuilder()
  .port(10013)
  .storagePath("./storage")
  .build();

Bun.serve({
  port: 10013,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/healthz") {
      return new Response("ok");
    }

    if (
      (req.headers.get("upgrade") || "").toLowerCase() === "websocket" &&
      runtime.tryUpgradeConversationWebSocket(req, server)
    ) {
      return;
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open: (ws) => runtime.handleWebSocketOpen(ws),
    message: (ws, message) => runtime.handleWebSocketMessage(ws, message),
    close: (ws, code, reason) => runtime.handleWebSocketClose(ws, code, reason),
    drain: () => {},
  },
});
```

## Builder API

`AmigoServerBuilder` 是 SDK 的主入口。

### 基础配置

```ts
new AmigoServerBuilder().port(10013).storagePath("./storage");
```

### 注册工具

```ts
import { AmigoServerBuilder, defineTool } from "@amigo-llm/backend/sdk";

const echoTool = defineTool({
  name: "echoText",
  description: "回显输入文本",
  params: [{ name: "text", optional: false, description: "输入内容" }],
  async invoke({ params, context }) {
    context.postMessage?.({ type: "tool-progress", data: { stage: "running" } });

    return {
      message: `echo 完成：${String(params.text)}`,
      toolResult: {
        ok: true,
        text: params.text,
      },
    };
  },
});

const server = new AmigoServerBuilder().registerTool(echoTool).build();
```

工具执行上下文里最常用的字段是：

- `context.taskId`
- `context.parentId`
- `context.signal`
- `context.postMessage()`
- `context.getSandbox()`
- `context.getToolByName()`

### 注册自定义消息

```ts
import { z } from "zod";
import { AmigoServerBuilder, defineMessage } from "@amigo-llm/backend/sdk";

const pingCustom = defineMessage({
  type: "pingCustom",
  dataSchema: z.object({
    traceId: z.string(),
    payload: z.string().optional(),
  }),
  async handler(data) {
    console.log("收到自定义消息", data.traceId, data.payload);
  },
});

const server = new AmigoServerBuilder().registerMessage(pingCustom).build();
```

行为边界：

- 内置消息优先走内置 resolver
- 只有未命中内置消息时，才会尝试匹配你注册的消息
- 消息会先经过 schema 校验，再执行 `handler`

### 模型工厂注入

默认情况下，服务端会从环境变量里创建模型实例。你也可以接管这一步：

```ts
import { AmigoServerBuilder } from "@amigo-llm/backend/sdk";

const server = new AmigoServerBuilder()
  .modelProvider(() => {
    return {
      async completion() {
        throw new Error("demo");
      },
    } as any;
  })
  .build();
```

适合：

- 多模型路由
- mock / test
- 对接自定义 provider

### 模型上下文窗口与自动压缩

如果你希望按模型手动配置上下文窗口，并在接近阈值时自动压缩历史上下文：

```ts
new AmigoServerBuilder().modelContextConfigs({
  "qwen3-coder": {
    contextWindow: 262144,
    compressionThreshold: 0.8,
    targetRatio: 0.5,
  },
});
```

也可以直接使用环境变量 `MODEL_CONTEXT_CONFIGS`，格式相同。

行为说明：

- 当前任务的上下文占比会同步到 `taskStatusMapUpdated.data.contextUsage`
- 当占比达到 `compressionThreshold` 时，服务端会先总结较早的会话，再只携带“压缩摘要锚点及其之后”的上下文继续调用模型
- 压缩开始 / 完成 / 失败会通过 `alert` 消息同步到前端

### 自动批准工具

```ts
new AmigoServerBuilder()
  .autoApproveTools(["readFile", "browserSearch"])
  .addAutoApproveTools(["bash"]);
```

如果你要完全覆盖 core 默认自动批准列表，也可以：

```ts
new AmigoServerBuilder()
  .defaultAutoApproveTools([])
  .autoApproveTools(["readFile", "editFile", "bash"]);
```

### 追加系统提示词

```ts
new AmigoServerBuilder()
  .appendSystemPrompt("你是一个 coding agent，先搜索定位，再修改并验证。");
```

### 覆盖默认 system prompt

如果你不希望在默认 prompt 后追加，而是希望按 `main` / `sub` 完整替换：

```ts
new AmigoServerBuilder()
  .mainSystemPrompt("你是一个 benchmark agent，只做仓库修复。")
  .subSystemPrompt("你是一个子任务修复代理，只返回执行结果。");
```

也可以一次性传入：

```ts
new AmigoServerBuilder().systemPrompts({
  main: "main prompt",
  sub: "sub prompt",
});
```

说明：

- `mainSystemPrompt()` / `subSystemPrompt()` / `systemPrompts()` 用于覆盖默认 prompt
- `appendSystemPrompt()` 也可用于在覆盖后的 prompt 末尾继续追加内容

### 覆盖基础工具集合

如果你要做 benchmark app、batch app，通常不希望沿用默认基础工具集合。此时可以直接覆盖：

```ts
import { AmigoServerBuilder, defineTool } from "@amigo-llm/backend/sdk";

const repoSearch = defineTool({
  name: "repoSearch",
  description: "在仓库内搜索文本",
  params: [{ name: "query", optional: false, description: "搜索关键词" }],
  async invoke() {
    return {
      message: "not implemented",
      toolResult: {},
    };
  },
});

new AmigoServerBuilder().baseTools({
  main: [repoSearch],
  sub: [repoSearch],
});
```

也可以分别设置：

```ts
new AmigoServerBuilder().mainBaseTools([repoSearch]).subBaseTools([repoSearch]);
```

说明：

- `baseTools()` 会覆盖默认 `main` / `sub` 基础工具集合
- 不配置时，仍然使用 core 默认基础工具

### 注入 sandbox manager

如果你希望沿用 `context.getSandbox()` 这套调用方式，但把 sandbox 生命周期、镜像、容器后端或仓库挂载逻辑换掉，可以注入自定义 manager：

```ts
import { AmigoServerBuilder, type SandboxManager } from "@amigo-llm/backend/sdk";

const sandboxManager: SandboxManager = {
  get(taskId) {
    return undefined;
  },
  async getOrCreate(taskId) {
    return {} as any;
  },
  has(taskId) {
    return false;
  },
  async destroy(taskId) {},
};

new AmigoServerBuilder().sandboxManager(sandboxManager);
```

### 配置默认 sandbox 镜像

SDK 本身没有 `sandboxImage()` 这类 app 配置入口。要自定义镜像，应该通过你自己的 sandbox manager 注入：

```ts
import { AmigoServerBuilder, SandboxRegistry } from "@amigo-llm/backend";

const sandboxManager = new SandboxRegistry({
  imageName: "my_custom_sandbox",
});

new AmigoServerBuilder().sandboxManager(sandboxManager);
```

适合：

- 自定义 Docker / VM / remote sandbox
- benchmark 专用 repo checkout / patch 导出逻辑
- 需要与现有 CI、评测机或沙箱平台打通的场景

### 会话创建钩子

应用层如果需要在创建任务后做初始化，可以使用：

```ts
new AmigoServerBuilder().onConversationCreate(async ({ taskId, context }) => {
  console.log("new task", taskId, context);
});
```

仓库内置应用就是通过这个钩子做 GitHub 仓库绑定和 sandbox 预创建的。

## 调试与检查

构建前可以读取：

- `builder.toolRegistry`
- `builder.messageRegistry`

构建后可以读取：

- `server.isRunning`
- `server.serverHandle`
- `server.toolRegistry`
- `server.messageRegistry`

也支持：

```ts
server.stop();
```

## 完整应用示例

仓库里的 [`packages/amigo`](../amigo) 展示了一个完整应用的组装方式，其中包括：

- design doc 读写工具
- Penpot 同步
- GitHub 仓库预热
- sandbox / bash / 文件编辑 / dev preview 工具
- `editor` / `preview` HTTP 路由
- preview HTTP / WebSocket 反代
- coding agent 专用系统提示词

对应入口在 [`packages/amigo/src/server/app.ts`](../amigo/src/server/app.ts)。如果你要做自己的应用，可以复用 backend runtime，并在自己的服务端入口里接入这些能力或替换成自己的实现。

## 运行时配置

完整应用运行时的环境变量说明见：

- [`../../README.md`](../../README.md)
- [`packages/amigo/.env.example`](../amigo/.env.example)
