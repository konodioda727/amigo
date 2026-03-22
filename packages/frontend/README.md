# @amigo-llm/frontend

`@amigo-llm/frontend` 是 Amigo 的 React SDK，提供：

- WebSocket 连接管理
- 任务与消息状态管理
- 聊天窗口与消息输入框
- mention、工具确认、任务切换等交互
- 自定义消息渲染器

它适合嵌入到已有 React 应用里，快速接一个多任务 agent UI。

## 安装

```bash
bun add @amigo-llm/frontend react react-dom react-router-dom
```

`react-router-dom` 现在按 peer dependency 提供，SDK 内置的设计稿跳转按钮会直接使用它。

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
    <WebSocketProvider url="ws://localhost:10013" autoConnect>
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

### WebSocketProvider

`WebSocketProvider` 是 SDK 入口，负责：

- 创建内部 Zustand store
- 建立 WebSocket 连接
- 提供 hooks 和组件上下文
- 挂载自定义 renderers 与事件回调

所有 SDK hooks 和组件都必须在 `WebSocketProvider` 内使用。

### Task 驱动的状态模型

SDK 不是只维护一条聊天流，而是按 `taskId` 组织状态：

- 每个 task 都有自己的 `rawMessages` 和 `displayMessages`
- 有 `mainTaskId` 和当前激活 task
- 可以在主任务和子任务之间切换

## Provider 参数

```tsx
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
| `reconnectAttempts` | `number` | `5` | 最大重连次数，`< 0` 可视为无限 |
| `renderers` | `Partial<MessageRendererMap>` | - | 自定义消息渲染器 |
| `initialState` | `WebSocketStoreConfig["initialState"]` | - | 初始状态注入 |
| `onConnect` / `onDisconnect` / `onError` | 回调 | - | 连接生命周期钩子 |

`url` 会直接传递到底层连接切片。

## 公开组件

### ChatWindow

用于展示某个 task 的消息列表：

```tsx
<ChatWindow taskId="task-123" />
```

常用 props：

- `taskId`
- `className`
- `showHeader`
- `headerContent`

### MessageInput

用于发送消息、处理中断 / 恢复、mention、附件上传、工具确认。

```tsx
<MessageInput
  taskId="task-123"
  placeholder="输入需求..."
  createTaskContext={{ repoUrl: "https://github.com/owner/repo" }}
/>
```

常用 props：

- `taskId`
- `placeholder`
- `onSend`
- `createTaskContext`
- `disabled`
- `showMentions`

内置能力：

- `Enter` 发送，`Shift + Enter` 换行
- 当任务处于 `streaming` / `interrupted` 时自动切换按钮状态
- mention 建议
- 文件附件上传
- 工具确认卡片

注意：附件上传依赖服务端的 `/api/uploads/oss/*` 接口；如果服务端没配 OSS，消息仍可发送，但附件上传会失败。

## Hooks

### useConnection

```tsx
const { status, isConnected, isConnecting, isDisconnected } = useConnection();
```

### useWebSocket

```tsx
const { status, connect, disconnect, reconnect, send, subscribe } = useWebSocket();
```

### useMessages

```tsx
const { messages, rawMessages, sendMessage, clearMessages } = useMessages(taskId);
```

### useSendMessage

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

### useTasks

```tsx
const {
  tasks,
  currentTaskId,
  mainTaskId,
  taskStatusMaps,
  taskAutoApproveToolNameMaps,
  switchTask,
  getTaskStatus,
} = useTasks();
```

### useMentions

```tsx
const { mentions, getMentionSuggestions, followupQueue, pendingMention } = useMentions();
```

## 自定义渲染器

你可以覆盖指定消息类型的 UI：

```tsx
<WebSocketProvider
  url="ws://localhost:10013"
  renderers={{
    tool: ({ message }) => <pre>{JSON.stringify(message, null, 2)}</pre>,
  }}
>
  <App />
</WebSocketProvider>
```

默认导出包括：

- `defaultRenderers`
- `DefaultMessageRenderer`
- `DefaultToolRenderer`
- `DefaultUserMessageRenderer`
- `DefaultErrorRenderer`
- `DefaultAlertRenderer`
- `DefaultInterruptRenderer`
- `DefaultAskFollowupQuestionRenderer`
- `DefaultBrowserSearchRenderer`

## 高级用法

### 读取底层上下文

```tsx
import { useWebSocketContext } from "@amigo-llm/frontend";

const { store, config, renderers, handlers } = useWebSocketContext();
```

适合做：

- 应用层页面路由联动
- 自定义工具卡片
- 直接操作 store

### 自定义工具结果 UI

应用可以基于 taskId、自己的 HTTP 路由和 renderers 体系，给工具结果补充 editor、preview、跳转按钮等 UI。下面是一个简单例子：

```tsx
import {
  DefaultToolRenderer,
  ToolAccordion,
  type ToolMessageRendererProps,
  useTasks,
  useWebSocketContext,
} from "@amigo-llm/frontend";

const AppToolRenderer = ({ message }: ToolMessageRendererProps<any>) => {
  const { mainTaskId, currentTaskId } = useTasks();
  const { config } = useWebSocketContext();
  const taskId = mainTaskId || currentTaskId;

  if (message.toolName === "updateDevServer" && taskId) {
    const baseUrl = config.url.replace(/^ws/, "http").replace(/\/$/, "");
    const previewUrl = `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/preview`;

    return (
      <ToolAccordion title="更新开发预览">
        <a href={previewUrl} target="_blank" rel="noreferrer">
          打开 Preview
        </a>
      </ToolAccordion>
    );
  }

  return <DefaultToolRenderer message={message} />;
};
```

## 注意事项

- 所有 hooks 必须在 `WebSocketProvider` 内使用
- `MessageInput` 的附件上传需要服务端 OSS 接口
- SDK 提供的是组件和状态能力，不包含仓库应用里的路由、侧边栏、设计页等完整壳层
- 如果你直接复用仓库应用，请再参考根 README 的部署约束，尤其是 `10013` 端口与 `wss` 的假设
