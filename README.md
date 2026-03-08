# Amigo

Amigo 是一个基于 WebSocket 的多任务对话/编排应用，包含：

- `packages/server`：Bun 服务端（任务编排、模型调用、工具执行、会话存储）
- `packages/frontend`：Bun + React 前端（聊天界面、任务切换、文档侧栏）
- `packages/types`：前后端共享类型


## 适用场景

本项目支持两种模式：`Spec 模式`与`会话模式`, agent 会根据任务复杂度决定进入哪个模式工作

- Spec 模式：需要明确需求、拆分任务、并行执行的复杂任务
- 会话模式：简单的脚本运行、日常生活问题解答

## 项目结构

```text
amigo/
├── package.json                # Monorepo 根脚本（bun workspace）
├── README.md
└── packages/
    ├── frontend/               # 前端应用 + 前端 SDK
    │   ├── src/components/     # 页面布局、侧边栏、文档面板
    │   ├── src/sdk/            # WebSocket Provider / hooks / UI 组件
    │   └── package.json
    ├── server/                 # Bun 服务端 + Server SDK
    │   ├── src/core/           # 编排、工具、消息处理等核心逻辑
    │   ├── src/appTools/       # 当前应用注册的工具集合
    │   └── package.json
    └── types/                  # 共享协议和类型定义
        └── package.json
```

## 环境要求

- Bun >= 1.0（建议使用较新版本）
- Node.js >= 18（主要用于工具链兼容）

说明：当前仓库的开发脚本以 `bun` 为主，README 中不再混用 `pnpm` 启动方式。

## 安装

```bash
git clone <your-repo-url>
cd amigo
bun install
```

## 服务端配置（必看）

服务端启动时会读取 `packages/server/.env`。

新建文件：`packages/server/.env`

```env
# 必填：模型 API Key
MODEL_API_KEY=your_api_key

# 可选：模型配置
MODEL_NAME=qwen3-coder
MODEL_BASE_URL=https://openrouter.ai/api/v1
LLM_TEMPERATURE=0

# 可选：服务配置
SERVER_PORT=10013
STORAGE_PATH=./storage
LOG_LEVEL=info

# 可选：搜索工具优化（browserSearch 会优先走 Google API，再回退 Google HTML 解析；不使用 Playwright）
# SERPER_API_KEY=your_serper_api_key
```

### 配置说明

- `MODEL_API_KEY`：必填；未配置时服务端会直接报错退出。
- `MODEL_NAME`：默认 `qwen3-coder`。
- `MODEL_BASE_URL`：默认 `https://openrouter.ai/api/v1`（仅 OpenAI 兼容模型路径使用）。
- `MODEL_NAME` 会通过内置映射表解析到 provider；若未命中任何 provider，会直接报错（不再做隐式兜底）。
- `SERVER_PORT`：WebSocket 服务端口，默认 `10013`。
- `STORAGE_PATH`：会话存储目录，默认 `./storage`（通常是 `packages/server/storage/`）。
- `SERPER_API_KEY`：可选；配置后 `browserSearch` 会优先调用 Google 搜索 API（SERPER），未配置时回退到 Google HTML 解析（无 Playwright 依赖）。

## 启动方法

说明：如果需要使用沙箱执行能力（例如隔离命令执行/任务运行），请先确认本机 Docker 已安装且 Docker 服务处于运行状态（Docker Desktop 或 Docker Engine）。未启动 Docker 时，相关能力会不可用或报错，但基础对话与普通功能仍可使用。

### 方式 1：同时启动前后端（推荐）

在仓库根目录执行：

```bash
bun dev
```

这个命令会通过 workspace 脚本同时启动前端和服务端（不包含 `types` 包）。

启动后关注两个地址：

- 前端：控制台打印的 `Server running at ...` 地址（通常是 `http://localhost:3000`）
- 服务端：`ws://localhost:10013`（或你在 `.env` 中配置的端口）

### 方式 2：分别启动（便于排查问题）

在两个终端中分别执行：

```bash
# 终端 1：服务端
bun --filter @amigo-llm/server start
```

```bash
# 终端 2：前端
bun --filter @amigo-llm/frontend start
```

### 方式 3：只启动服务端（用于对接自定义前端）

```bash
bun --filter @amigo-llm/server start
```

### 方式 4：只启动前端（用于联调远程服务端）

```bash
bun --filter @amigo-llm/frontend start
```

注意：前端默认会连接当前页面主机名的 `10013` 端口（协议自动在 `ws/wss` 间切换）。如果你的服务端端口不是 `10013`，需要自行修改前端连接逻辑或做端口映射。

## 首次使用流程（详细）

以下流程按当前前端界面行为整理。

### 1. 打开页面并确认连接状态

- 打开前端页面后，顶部右侧会显示连接状态（已连接/连接中/已断开）。
- 如果一直显示“已断开”，优先检查服务端是否启动、`SERVER_PORT` 是否为 `10013`、防火墙/端口占用情况。

### 2. 新建对话

- 左侧边栏点击“新对话”。
- 页面会回到首页，等待你输入第一条消息。
- 第一次发送消息时，如果当前没有任务 ID，前端会自动发送 `createTask` 请求创建主任务。

### 3. 发送消息

- 在底部输入框输入内容，按 `Enter` 发送。
- 使用 `Shift + Enter` 换行。
- 发送后消息会在主区域流式显示。

### 4. 观察任务执行和切换

- 顶部会显示“主任务”以及当前激活的子任务（如果存在）。
- 左侧“历史对话”中可以切换到已有会话。
- 当前路由支持 `/:taskId`，可以直接通过 URL 打开指定任务历史。

### 5. 中断 / 恢复执行

输入框右侧按钮会根据任务状态自动切换：

- 发送中：显示“停止”按钮（中断当前执行）
- 已中断：显示“继续”按钮（恢复执行）
- 空闲/完成：显示“发送”按钮

### 6. 工具调用确认（如出现）

- 某些工具调用会在输入框上方显示确认区域。
- 你可以确认或拒绝该次工具执行。
- 如果服务端配置了自动批准工具，则部分工具不会弹出确认。

### 7. 文档侧栏（需求 / 设计 / 任务）

右侧文档侧栏会在有内容时显示，包含三个标签：

- `需求`
- `设计`
- `任务`

使用方式：

- 点击标签切换文档内容
- 点击 `Edit` 进入编辑模式
- 保存后会同步到当前任务文档（前端会发送 `updateTaskDoc`）
- 在 `任务` 标签中，可点击任务项跳转到对应子任务（前提是该任务行已解析出子任务 ID）

### 8. 会话历史与删除

- 左侧“历史对话”会显示已保存会话。
- 选择某条历史可重新加载。
- 删除后如果当前正在查看该会话，页面会自动回到首页。

## 输入框与交互细节

- `Enter`：发送消息
- `Shift + Enter`：换行
- 输入框按钮状态会随任务状态变化（发送 / 停止 / 继续）
- 输入 `@` 可触发 mention 候选（用于引用会话/上下文，具体候选内容由前端 store 决定）

## 构建与常用命令

### 根目录命令

```bash
bun dev          # 同时启动前后端
bun run build    # 构建所有 workspace 包
bun run lint     # Biome 检查
bun run lint:fix # 自动修复格式/部分 lint 问题
```

### 单包命令

```bash
# 服务端
bun --filter @amigo-llm/server build
bun --filter @amigo-llm/server test
bun --filter @amigo-llm/server start

# 前端
bun --filter @amigo-llm/frontend build
bun --filter @amigo-llm/frontend start

# 类型包
bun --filter @amigo-llm/types build
```

## 构建产物

- 前端：`packages/frontend/dist/`
- 服务端：`packages/server/dist/`
- 类型：`packages/types/dist/`

## 常见问题

### 1）启动服务端时报错 `MODEL_API_KEY environment variable is required`

原因：未配置 `packages/server/.env` 中的 `MODEL_API_KEY`。

处理：补充 `MODEL_API_KEY` 后重启服务端。

### 2）前端页面能打开，但一直显示未连接

检查项：

- 服务端是否已启动
- 服务端端口是否为 `10013`（或前端连接逻辑是否已同步修改）
- 当前页面主机名是否能访问服务端端口（本机/远端/反向代理）
- 浏览器控制台和服务端日志是否有 WebSocket 握手错误

### 3）历史记录/任务文档没有保存

检查项：

- `STORAGE_PATH` 是否可写
- 服务端进程当前工作目录是否符合预期
- 是否在执行过程中异常退出（可查看服务端日志）

### 4）搜索工具结果异常

`browserSearch` 当前为纯 HTTP 方案（不依赖 Playwright）。必要时尝试：

- 检查目标站点是否对机器人请求有限制
- 配置 `SERPER_API_KEY` 以提升 Google 结果稳定性
- 查看服务端日志中的工具调用错误信息

## SDK 说明（简版）

本仓库除了应用本体，还提供前后端 SDK：

- 前端 SDK：`@amigo-llm/frontend`
- 服务端 SDK（扩展入口建议）：`@amigo-llm/server/sdk`
- 类型包：`@amigo-llm/types`

如果你要做二次集成，优先查看：

- `packages/frontend/README.md`（前端 SDK 使用说明）
- `packages/server/README.md`（服务端 SDK 使用说明）
- `packages/server/package.json`（导出入口与子路径）
- `packages/types/package.json`

## 开发建议

- 文档、代码和默认端口保持一致（当前前端默认连 `10013`）
- 新增环境变量时同步更新本 README 的“服务端配置”章节
- 修改前端连接策略时同步更新“启动方法”和“常见问题”章节

## 许可证

ISC
