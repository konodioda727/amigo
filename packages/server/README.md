# @amigo-llm/server SDK

`@amigo-llm/server` 包同时包含两类内容：

- 运行时入口（仓库内服务端程序）
- SDK 扩展能力（用于注册自定义工具、消息、模型工厂等）

如果你要使用 SDK，请优先使用子路径导入：

```ts
import { AmigoServerBuilder, defineTool, defineMessage } from "@amigo-llm/server/sdk";
```

本文档聚焦 SDK 用法，不展开仓库内置服务端业务逻辑细节。

## 适用场景

- 在 Amigo 服务端基础上注册自定义工具
- 增加自定义 WebSocket 入站消息类型
- 注入自己的模型工厂（替代默认环境变量创建逻辑）
- 为应用增加全局系统提示词 / 自动批准工具策略

## 安装

如果你在仓库内开发，依赖已由 workspace 管理，无需单独安装。

如果在独立项目中使用：

```bash
bun add @amigo-llm/server @amigo-llm/types zod
```

说明：

- SDK 类型和消息/工具协议与 `@amigo-llm/types` 强相关
- 运行时基于 Bun，建议在 Bun 环境下运行

## 快速开始

### 最小示例（使用 SDK 构建并启动服务）

```ts
import { AmigoServerBuilder } from "@amigo-llm/server/sdk";

const server = new AmigoServerBuilder().port(10013).storagePath("./storage").build();

server.start();
```

兼容说明：`server.init()` 仍可用，但建议使用 `server.start()`。

## Builder API（`AmigoServerBuilder`）

`AmigoServerBuilder` 用于配置并构建服务端实例。

### 常用链式方法

#### `port(port: number)`

设置 WebSocket 端口。

#### `storagePath(path: string)`

设置会话/任务存储目录。

#### `registerTool(tool)`

注册自定义工具，工具会进入运行时工具执行链。

#### `registerMessage(message)`

注册自定义入站消息类型。

行为边界（重要）：

- 仅当消息未匹配到内置消息类型时，才会尝试走自定义消息注册表
- 校验通过后会调用你提供的 `handler`
- 内置消息（如 `createTask`、`userSendMessage`、`loadTask` 等）仍由内置 resolver 处理

#### `llmFactory(factory)` / `modelProvider(factory)`

注入模型工厂，覆盖默认的环境变量模型创建逻辑。

适合场景：

- 使用自定义模型客户端
- 注入 mock 模型用于测试
- 做模型路由 / 多模型选择

#### `autoApproveTools(toolNames: string[])`

覆盖额外自动批准工具列表（相对内置默认策略）。

#### `addAutoApproveTools(toolNames: string[])`

在已有列表基础上追加工具名。

#### `appendSystemPrompt(prompt: string)`

在默认系统提示词后追加全局提示词（常用于应用特化）。

#### `extraSystemPrompt(prompt: string)`

覆盖式设置额外系统提示词（语义化别名）。

#### `build()`

校验配置并返回服务器实例。

### 调试辅助属性

- `builder.toolRegistry`
- `builder.messageRegistry`

适合在 `build()` 前做检查或输出日志。

## 自定义工具（`defineTool`）

`defineTool` 是一个类型辅助函数，本质上会返回你传入的工具定义，但能提供更好的类型提示。

### 工具定义结构

关键字段：

- `name`
- `description`
- `params`
- `whenToUse`（可选）
- `invoke({ params, context })`

当前 `invoke` 签名（实际类型）：

- `params`：解析后的工具参数
- `context.taskId`：当前任务 ID
- `context.parentId`：父任务 ID（如果有）
- `context.getSandbox()`：获取沙箱实例（懒加载）
- `context.getToolByName(name)`：获取其他工具
- `context.signal`：中断信号
- `context.postMessage()`：向前端/流程发送进度消息（可选）

### 示例：注册一个简单工具

```ts
import { defineTool, AmigoServerBuilder } from "@amigo-llm/server/sdk";

const echoTool = defineTool({
  name: "echoText",
  description: "返回输入文本",
  params: [
    {
      name: "text",
      optional: false,
      description: "要回显的文本",
    },
  ],
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
server.start();
```

说明：自定义工具的 `toolResult` 在类型上是宽松的（适合扩展场景），但建议保持结构稳定，便于前端渲染和后续维护。

## 自定义消息（`defineMessage` + `registerMessage`）

用于扩展服务端可接收的 WebSocket 消息类型（入站消息）。

### 示例：注册 `pingCustom` 消息

```ts
import { z } from "zod";
import { AmigoServerBuilder, defineMessage } from "@amigo-llm/server/sdk";

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
server.start();
```

### 消息校验与错误返回

服务端会对自定义消息进行 schema 校验。常见失败情况：

- 消息缺少 `type`
- 消息结构不符合 `{ type, data }`
- `data` 字段不满足你定义的 `dataSchema`
- 注册了消息但未提供 `handler`

这些情况会通过 WebSocket 返回错误消息（例如校验失败、handler 缺失、handler 执行异常）。

## 模型注入（`llmFactory` / `modelProvider`）

默认情况下，服务端会从环境变量创建模型实例（例如读取 `MODEL_API_KEY`、`MODEL_NAME` 等），并通过内置的 modelName→provider 映射表选择 provider；若 `MODEL_NAME` 未命中映射表会直接报错。

你可以在 SDK 层覆盖这个逻辑：

```ts
import { AmigoServerBuilder } from "@amigo-llm/server/sdk";

const builder = new AmigoServerBuilder().modelProvider(() => {
  // 返回符合 AmigoLlm 接口的实例（需实现 stream(messages, { signal })）
  // 这里省略具体实现
  return myChatModel;
});

const server = builder.build();
server.start();
```

适合在：

- 测试环境使用 mock 模型
- 多租户按请求切换模型（需结合你自己的封装）
- 与已有模型网关整合

## 配置与校验

SDK 导出 `ServerConfigSchema` 和 `ServerConfig`，可用于在你的应用层提前校验配置。

```ts
import { ServerConfigSchema } from "@amigo-llm/server/sdk";

const config = ServerConfigSchema.parse({
  port: 10013,
  storagePath: "./storage",
});
```

## 注册表（高级用法）

SDK 导出两个注册表类，适合你在 `build()` 前做集中注册与检查：

- `ToolRegistry`
- `MessageRegistry`

它们都支持：

- `register(...)`
- `get(name/type)`
- `getAll()`
- `has(name/type)`
- `size`

`MessageRegistry` 额外提供：

- `getAllSchemas()`

重复注册会抛出 `RegistrationError`。

## 运行要求与沙箱说明

### Bun

服务端运行依赖 Bun，建议直接使用 Bun 启动：

```bash
bun run src/index.ts
```

### Docker（仅在使用沙箱相关能力时必需）

如果你的工具链或任务流程会用到沙箱执行能力（隔离命令执行/容器化运行），需要满足：

- 本机已安装 Docker
- Docker Desktop / Docker Engine 已启动

Docker 未启动时：

- 服务端本身可以启动
- 不依赖沙箱的功能可以使用
- 需要沙箱的能力会报错或不可用

## 常见问题

### 1. 为什么 `registerMessage` 没有生效？

先确认发送的消息类型是否已经是内置消息类型。如果是内置类型，服务端会优先走内置 resolver，不会进入你注册的自定义消息处理器。

### 2. `MODEL_API_KEY environment variable is required`

这是默认模型创建逻辑报错。处理方式：

- 配置环境变量（例如在 `.env` 中设置 `MODEL_API_KEY`）
- 或使用 `llmFactory()` / `modelProvider()` 注入模型，绕过默认逻辑

### 3. `server.start()` 和 `server.init()` 有什么区别？

当前 `init()` 是兼容旧 API 的别名，内部会调用 `start()`。新代码建议统一使用 `start()`。

## 导出概览（SDK 子路径）

从 `@amigo-llm/server/sdk` 可用的核心导出包括：

- `AmigoServerBuilder`
- `defineTool`
- `defineMessage`
- `ToolRegistry` `MessageRegistry`
- `RegistrationError` `ValidationError`
- `ServerConfigSchema`
- 相关类型（`ServerConfig`、`ToolInterface`、`LlmFactory` 等）

## 仓库内开发命令（参考）

```bash
# 在仓库根目录
bun --filter @amigo-llm/server start
bun --filter @amigo-llm/server build
bun --filter @amigo-llm/server test
```
