# @amigo-llm/frontend

`@amigo-llm/frontend` 是 Amigo 的 React SDK。

它负责：

- WebSocket 连接管理
- task / message 状态管理
- 聊天窗口与消息输入框
- mention、工具确认、任务切换等交互
- 自定义消息渲染器

它不负责：

- 认证
- 路由守卫
- HTTP 接口
- 数据库
- 产品级页面结构

这些都由应用层决定。

## 安装

```bash
bun add @amigo-llm/frontend react react-dom react-router-dom
```

## 引入样式

```ts
import "@amigo-llm/frontend/styles";
```

建议在应用入口引入一次。

## 最小示例

```tsx
import { ChatWindow, MessageInput, WebSocketProvider } from "@amigo-llm/frontend";
import "@amigo-llm/frontend/styles";

export default function App() {
  return (
    <WebSocketProvider url="ws://localhost:10013/ws" autoConnect>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <ChatWindow />
        <MessageInput placeholder="输入消息..." />
      </div>
    </WebSocketProvider>
  );
}
```

前提：

- WebSocket 服务端已启动
- 前后端协议与 `@amigo-llm/types` 一致

## 核心概念

### `WebSocketProvider`

`WebSocketProvider` 是 SDK 入口，负责：

- 创建内部 Zustand store
- 建立 WebSocket 连接
- 提供 hooks 和组件上下文
- 挂载自定义 renderers 与事件回调

所有 SDK hooks 和组件都必须在 `WebSocketProvider` 内使用。

### task 驱动的状态模型

SDK 按 `taskId` 组织状态：

- 每个 task 都有自己的 `rawMessages` 和 `displayMessages`
- 有 `mainTaskId` 和当前激活 task
- 可以在主任务和子任务之间切换

## Provider 参数

```tsx
<WebSocketProvider
  url="ws://localhost:10013/ws"
  autoConnect={true}
  reconnect={true}
  reconnectInterval={3000}
  reconnectAttempts={5}
  onConnect={() => console.log("connected")}
  onDisconnect={() => console.log("disconnected")}
  onError={(error) => console.error(error)}
>
  <App />
</WebSocketProvider>
```

### 主要 props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `url` | `string` | `ws://localhost:10013` | WebSocket 地址 |
| `autoConnect` | `boolean` | `true` | Provider 挂载后自动连接 |
| `reconnect` | `boolean` | `true` | 是否自动重连 |
| `reconnectInterval` | `number` | `3000` | 重连间隔，毫秒 |
| `reconnectAttempts` | `number` | `5` | 最大重连次数 |
| `renderers` | `Partial<MessageRendererMap>` | - | 自定义消息渲染器 |
| `initialState` | `WebSocketStoreConfig["initialState"]` | - | 初始状态注入 |
| `onConnect` / `onDisconnect` / `onError` | 回调 | - | 连接生命周期钩子 |

## 公开组件

### `ChatWindow`

用于展示某个 task 的消息列表：

```tsx
<ChatWindow taskId="task-123" />
```

### `MessageInput`

用于发送消息、处理中断 / 恢复、mention、附件上传、工具确认。

```tsx
<MessageInput
  taskId="task-123"
  placeholder="输入需求..."
  createTaskContext={{ repoUrl: "https://github.com/owner/repo" }}
/>
```

## Hooks

### `useConnection`

```tsx
const { status, isConnected, isConnecting, isDisconnected } = useConnection();
```

### `useWebSocket`

```tsx
const { status, connect, disconnect, reconnect, send, subscribe } = useWebSocket();
```

### `useMessages`

```tsx
const { messages, rawMessages, sendMessage, clearMessages } = useMessages(taskId);
```

### `useSendMessage`

```tsx
const {
  sendMessage,
  sendCreateTask,
  sendInterrupt,
  sendResume,
  sendLoadTask,
  sendConfirm,
  sendReject,
  sendDeleteTask,
  sendUpdateAutoApproveTools,
} = useSendMessage();
```

### `useTasks`

```tsx
const {
  tasks,
  currentTaskId,
  mainTaskId,
  taskStatusMaps,
  switchTask,
  getTaskStatus,
} = useTasks();
```

## 自定义渲染器

你可以覆盖指定消息类型的 UI：

```tsx
<WebSocketProvider
  url="ws://localhost:10013/ws"
  renderers={{
    tool: ({ message }) => <pre>{JSON.stringify(message, null, 2)}</pre>,
  }}
>
  <App />
</WebSocketProvider>
```

## 责任边界

frontend SDK 负责：

- WebSocket UI 组件
- task store
- hooks
- 默认消息渲染

应用层负责：

- 登录态
- 路由结构
- 页面壳层
- 服务端 URL 约定
- HTTP 接口调用
- 产品级功能页面

在这个仓库里，这些产品能力由 `packages/amigo` 提供，而不是 `packages/frontend` 本身。
