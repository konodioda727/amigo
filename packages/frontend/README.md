# @amigo-llm/frontend

`@amigo-llm/frontend` 是 Amigo 的 React SDK，提供 WebSocket 连接管理、任务状态管理、消息渲染能力以及一组可复用组件，适合在业务应用中快速接入多任务对话界面。

本文档以当前仓库代码为准，重点覆盖：安装、最小示例、常用 hooks、组件使用、渲染定制、常见问题。

## 安装

```bash
bun add @amigo-llm/frontend react react-dom
```

也可使用 `pnpm` / `npm` / `yarn`。

### 样式引入

SDK 提供样式导出：

```ts
import "@amigo-llm/frontend/styles";
```

建议在应用入口文件中引入一次。

## 快速开始

### 最小可用示例

```tsx
import {
  WebSocketProvider,
  ChatWindow,
  MessageInput,
} from "@amigo-llm/frontend";
import "@amigo-llm/frontend/styles";

export default function App() {
  return (
    <WebSocketProvider url="ws://localhost:10013" autoConnect>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <ChatWindow className="flex-1" />
        <MessageInput placeholder="输入消息..." />
      </div>
    </WebSocketProvider>
  );
}
```

前提条件：

- WebSocket 服务端已启动（默认 `ws://localhost:10013`）
- 前后端消息协议与 `@amigo-llm/types` 保持一致（仓库内联调时已满足）

## 核心概念

### `WebSocketProvider`

`WebSocketProvider` 是 SDK 的入口组件，负责：

- 创建内部 Zustand store
- 建立/关闭 WebSocket 连接
- 向子组件提供上下文（store、配置、渲染器、事件回调）

必须把所有 SDK hooks 和组件放在 `WebSocketProvider` 内部使用。

### 任务（Task）与消息（Message）

SDK 的状态组织方式不是单一聊天流，而是围绕 `taskId` 管理：

- 每个任务维护自己的 `rawMessages` 和 `displayMessages`
- 当前激活任务可切换（适合主任务/子任务场景）
- SDK 会根据服务端消息更新任务状态、任务树和文档侧栏数据

## `WebSocketProvider` 使用说明

```tsx
import { WebSocketProvider } from "@amigo-llm/frontend";

<WebSocketProvider
  url="ws://localhost:10013"
  autoConnect={true}
  reconnect={true}
  reconnectInterval={3000}
  reconnectAttempts={5}
  onConnect={() => console.log("connected")}
  onDisconnect={() => console.log("disconnected")}
  onError={(error) => console.error(error)}
>
  <YourApp />
</WebSocketProvider>;
```

### 常用 props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `url` | `string` | `ws://localhost:10013` | WebSocket 地址 |
| `autoConnect` | `boolean` | `true` | Provider 挂载后是否自动连接 |
| `reconnect` | `boolean` | `true` | 预留配置（由 store 配置承载） |
| `reconnectInterval` | `number` | `3000` | 重连间隔（毫秒） |
| `reconnectAttempts` | `number` | `5` | 最大重连次数 |
| `onConnect` | `() => void` | - | 连接建立回调 |
| `onDisconnect` | `() => void` | - | 连接断开回调 |
| `onError` | `(error: Error) => void` | - | 错误回调 |
| `onMessage` | `(message: any) => void` | - | 预留消息回调（当前实现未做细粒度转发） |
| `renderers` | `Partial<MessageRendererMap>` | - | 自定义渲染器映射 |
| `initialState` | `WebSocketStoreConfig["initialState"]` | - | 初始化任务状态（测试/恢复场景） |

### 当前版本已知行为（重要）

当前仓库实现中，底层连接切片会直接使用 `window.location.hostname:10013` 建立连接，`url` 参数尚未完整贯通到底层连接逻辑。

这意味着：

- 你传入 `url` 仍会进入 Provider 配置，但实际连接地址可能仍是 `*:10013`
- 如果你的服务端不在 `10013` 端口，可能需要先修改 SDK 源码中的连接逻辑（`src/sdk/store/slices/connectionSlice.ts`）

如果你准备对外发布 SDK，建议优先修复这点。

## Hooks

所有 hooks 都必须在 `WebSocketProvider` 内使用。

### `useConnection()`

读取连接状态。

```tsx
import { useConnection } from "@amigo-llm/frontend";

function ConnectionStatus() {
  const { status, isConnected, isConnecting, isDisconnected } = useConnection();

  return (
    <div>
      状态: {status}
      {isConnected && " (已连接)"}
      {isConnecting && " (连接中)"}
      {isDisconnected && " (未连接)"}
    </div>
  );
}
```

返回值（常用）：

- `status`
- `isConnected`
- `isConnecting`
- `isDisconnected`
- `error`（当前实现固定为 `null`，预留字段）

### `useWebSocket()`

底层连接与消息发送/订阅能力，适合需要更强控制的场景。

```tsx
import { useEffect } from "react";
import { useWebSocket } from "@amigo-llm/frontend";

function DebugPanel() {
  const { status, connect, disconnect, subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe("ack", (data) => {
      console.log("ack:", data);
    });
    return unsubscribe;
  }, [subscribe]);

  return (
    <div>
      <div>{status}</div>
      <button onClick={connect}>连接</button>
      <button onClick={disconnect}>断开</button>
    </div>
  );
}
```

常用返回值：

- `connect()` / `disconnect()` / `reconnect()`
- `send(taskId, message)`
- `subscribe(type, listener)`

### `useMessages(taskId?)`

读取某个任务的消息（未传 `taskId` 时使用当前激活任务）。

```tsx
import { useMessages } from "@amigo-llm/frontend";

function TaskMessages({ taskId }: { taskId?: string }) {
  const { messages, sendMessage, clearMessages } = useMessages(taskId);

  return (
    <div>
      <button onClick={() => sendMessage("继续执行")}>发送消息</button>
      <button onClick={clearMessages}>清空当前任务消息</button>
      <pre>{JSON.stringify(messages, null, 2)}</pre>
    </div>
  );
}
```

返回值：

- `messages`：面向 UI 的显示消息数组（已做聚合/转换）
- `rawMessages`：原始 WebSocket 消息数组
- `sendMessage(message)`
- `clearMessages()`

注意：当当前没有可用任务 ID 时，`sendMessage` / `clearMessages` 会直接返回并在控制台打印警告。

### `useSendMessage()`

面向业务层的消息发送封装，适合直接操作任务生命周期。

```tsx
import { useSendMessage } from "@amigo-llm/frontend";

function TaskControls({ taskId }: { taskId?: string }) {
  const {
    sendCreateTask,
    sendMessage,
    sendInterrupt,
    sendResume,
    sendLoadTask,
    sendConfirm,
    sendReject,
    sendDeleteTask,
  } = useSendMessage();

  return (
    <div>
      <button onClick={() => sendCreateTask("帮我整理这个需求")}>新建任务</button>
      <button onClick={() => sendMessage("继续", taskId)}>发送消息</button>
      <button onClick={() => sendInterrupt(taskId)}>中断</button>
      <button onClick={() => sendResume(taskId)}>继续执行</button>
      <button onClick={() => taskId && sendLoadTask(taskId)}>加载历史</button>
      <button onClick={() => taskId && sendConfirm(taskId)}>确认工具调用</button>
      <button onClick={() => taskId && sendReject(taskId)}>拒绝工具调用</button>
      <button onClick={() => taskId && sendDeleteTask(taskId)}>删除任务</button>
    </div>
  );
}
```

说明：

- `sendCreateTask(message)` 会发送 `createTask`，由服务端生成新的 `taskId`
- `sendMessage(message, taskId?)` 在未提供 `taskId` 时会尝试使用当前活动任务
- `sendConfirm/sendReject` 会同时更新本地任务状态（便于 UI 及时响应）

### `useTasks()`

读取任务树和任务状态。

常用字段：

- `tasks`
- `currentTaskId`
- `mainTaskId`
- `switchTask(taskId)`
- `getTaskHierarchy(taskId)`
- `getTaskStatus(taskId)`

适用于：任务侧栏、任务树导航、状态标签等 UI。

### 其他 hooks

- `useMentions()`：提及项 / 追问队列（输入联想场景）
- `useRenderer()`：获取自定义或默认消息渲染器
- `useWebSocketContext()`：高级用法，直接访问内部 store 与配置

## 组件

### `ChatWindow`

用于展示当前任务的消息列表，通常与 `MessageInput` 搭配使用。

### `MessageInput`

输入框组件，负责发送用户消息。适合快速搭建默认聊天界面。

### `TaskRenderer`

用于渲染任务相关内容（任务层级/状态展示场景）。

说明：组件的细节 props 以导出类型定义为准（`src/sdk/index.ts` / `dist/sdk/index.d.ts`）。如果你需要高度自定义布局，也可以只使用 hooks 自己实现 UI。

## 自定义渲染器

SDK 支持通过 `WebSocketProvider` 的 `renderers` 属性覆盖默认消息渲染器。

```tsx
import {
  WebSocketProvider,
  defaultRenderers,
  type MessageRendererProps,
} from "@amigo-llm/frontend";

function MyMessageRenderer(props: MessageRendererProps) {
  return <div style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(props.message.data)}</div>;
}

<WebSocketProvider
  renderers={{
    ...defaultRenderers,
    message: MyMessageRenderer,
  }}
>
  <App />
</WebSocketProvider>;
```

建议做法：

- 只覆盖你关心的类型，其他继续复用 `defaultRenderers`
- 保留错误消息和中断消息渲染，便于排障
- 渲染器组件保持纯函数，避免在渲染期触发副作用

## 与服务端联调

最常见的本地联调方式：

1. 启动 Amigo 服务端（默认 `10013`）
2. 启动你的 React 应用
3. 使用 `WebSocketProvider` 包裹页面
4. 通过 `useSendMessage` 或 `MessageInput` 发送 `createTask` / `userSendMessage`

如果你直接使用本仓库示例页面，也可以参考根目录 README 的启动方式。

## 常见问题

### 1. `useXxx` hooks 报错：必须在 `WebSocketProvider` 内使用

原因：SDK hooks 依赖 React Context。

处理：确认组件树中已被 `WebSocketProvider` 包裹。

### 2. 前端显示已打开页面，但一直连不上服务端

- 确认服务端已启动
- 确认端口为 `10013`
- 查看浏览器控制台 WebSocket 报错
- 注意本文档上面的“当前版本已知行为（url 未完全贯通）”

### 3. `onMessage` 没有拿到每条消息回调

当前 Provider 中 `onMessage` 为预留接口，尚未实现细粒度消息分发回调。如需监听消息，请使用 `useWebSocket().subscribe(...)`。

## 导出概览（按分组）

- Provider：`WebSocketProvider`
- Hooks：`useConnection` `useMessages` `useSendMessage` `useTasks` `useWebSocket` 等
- Components：`ChatWindow` `MessageInput` `TaskRenderer` 等
- Renderers：`defaultRenderers` 及默认渲染器组件
- Types：hooks 返回值、渲染器类型、消息类型重导出

## 开发与调试（仓库内）

```bash
# 在仓库根目录
bun --filter @amigo-llm/frontend start
bun --filter @amigo-llm/frontend dev
bun --filter @amigo-llm/frontend build
```

如果你在修改 SDK 源码并联调服务端，建议同时启动：

```bash
bun --filter @amigo-llm/server start
bun --filter @amigo-llm/frontend dev
```
