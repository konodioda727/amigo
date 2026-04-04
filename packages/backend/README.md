# @amigo-llm/backend

`@amigo-llm/backend` 是 Amigo 的后端 SDK。

它负责：

- 会话模型
- 任务编排
- 工具系统
- sandbox 调用抽象
- conversation WebSocket runtime
- 持久化接口与调用流程

它不负责：

- MySQL / PostgreSQL / SQLite 的连接参数
- migration
- HTTP 路由
- 认证
- 产品级页面与集成

这些都属于应用层。

## 安装

```bash
bun add @amigo-llm/backend @amigo-llm/types zod
```

运行时基于 Bun，建议直接在 Bun 环境下使用。

## 核心原则

backend 只认持久化抽象，不认具体数据库。

当前核心接口见：

- [src/core/persistence/types.ts](/Users/lawkaiqing/code/amigo/packages/backend/src/core/persistence/types.ts)

应用必须注入一个 `ConversationPersistenceProvider`。  
backend 不再默认回退文件存储。

## 最小示例

下面是一个最小的 headless runtime 例子。重点是：应用自己提供 provider。

```ts
import Bun from "bun";
import {
  AmigoServerBuilder,
  type ConversationPersistenceProvider,
} from "@amigo-llm/backend/sdk";

const persistenceProvider: ConversationPersistenceProvider = {
  exists(taskId) {
    throw new Error("implement exists");
  },
  load(taskId) {
    throw new Error("implement load");
  },
  save(record) {
    throw new Error("implement save");
  },
  delete(taskId) {
    throw new Error("implement delete");
  },
  listConversationRelations() {
    return [];
  },
  listSessionHistories() {
    return [];
  },
};

const runtime = new AmigoServerBuilder()
  .port(10013)
  .cachePath("./.amigo")
  .conversationPersistenceProvider(persistenceProvider)
  .build();

Bun.serve({
  port: 10013,
  fetch(req, server) {
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

`AmigoServerBuilder` 是 SDK 主入口。

### 基础配置

```ts
new AmigoServerBuilder()
  .port(10013)
  .cachePath("./.amigo")
  .conversationPersistenceProvider(provider);
```

`conversationPersistenceProvider(...)` 是必填项。

### 注册工具

```ts
import { AmigoServerBuilder, defineTool } from "@amigo-llm/backend/sdk";

const echoTool = defineTool({
  name: "echoText",
  description: "回显输入文本",
  params: [{ name: "text", optional: false, description: "输入内容" }],
  async invoke({ params }) {
    return {
      message: `echo 完成: ${String(params.text)}`,
      toolResult: { text: params.text },
    };
  },
});

const server = new AmigoServerBuilder()
  .port(10013)
  .cachePath("./.amigo")
  .conversationPersistenceProvider(provider)
  .registerTool(echoTool)
  .build();
```

如果某个工具执行后应该立即结束当前回合、把控制权交还给用户，可以声明：

```ts
const askUserChoice = defineTool({
  name: "askUserChoice",
  description: "请求用户补充选择信息",
  completionBehavior: "idle",
  params: [],
  async invoke() {
    return {
      message: "已请求用户补充信息",
      toolResult: {},
    };
  },
});
```

`completionBehavior: "idle"` 的效果和内置 `askFollowupQuestion` 一致：工具执行完成后会结束当前执行循环，等待用户下一次输入，而不是让模型立刻基于工具结果继续跑下一轮。

### 注册自定义消息

```ts
import { z } from "zod";
import { AmigoServerBuilder, defineMessage } from "@amigo-llm/backend/sdk";

const pingMessage = defineMessage({
  type: "pingCustom",
  dataSchema: z.object({
    traceId: z.string(),
  }),
  async handler(data) {
    console.log("received", data.traceId);
  },
});

new AmigoServerBuilder()
  .port(10013)
  .cachePath("./.amigo")
  .conversationPersistenceProvider(provider)
  .registerMessage(pingMessage)
  .build();
```

### 模型工厂与模型配置

可以直接注入模型工厂：

```ts
new AmigoServerBuilder()
  .conversationPersistenceProvider(provider)
  .modelProvider(() => {
    return {
      async completion() {
        throw new Error("implement model");
      },
    } as any;
  });
```

也可以配置模型元信息：

```ts
new AmigoServerBuilder()
  .conversationPersistenceProvider(provider)
  .modelConfigs({
    "qwen3-coder": {
      provider: "openai-compatible",
      baseURL: "https://openrouter.ai/api/v1",
      contextWindow: 262144,
      compressionThreshold: 0.8,
      targetRatio: 0.5,
    },
  });
```

### 自动批准工具

```ts
new AmigoServerBuilder()
  .conversationPersistenceProvider(provider)
  .autoApproveTools(["readFile", "browserSearch"]);
```

### 系统提示词

```ts
new AmigoServerBuilder()
  .conversationPersistenceProvider(provider)
  .appendSystemPrompt("你是一个 coding agent。");
```

### sandbox manager

如果应用希望替换 sandbox 生命周期和容器实现，可以注入自己的 manager：

```ts
import { type SandboxManager } from "@amigo-llm/backend/sdk";

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

new AmigoServerBuilder()
  .conversationPersistenceProvider(provider)
  .sandboxManager(sandboxManager);
```

## 责任边界

backend 负责：

- 会话运行时
- WebSocket 协议
- 消息处理与任务状态
- 工具执行
- 持久化抽象

应用层负责：

- 数据库连接参数
- migration
- 持久化 provider 实现
- HTTP 路由
- 认证
- 多渠道集成

在这个仓库里，MySQL provider 由 `packages/amigo` 提供，而不是 `packages/backend` 直接持有数据库配置。
