<div align="center">

# Amigo

**下一代 AI 智能体协作平台**

一个企业级的 WebSocket 驱动的 AI 智能体系统，通过层级化任务委派和实时流式响应，重新定义人机协作方式。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.x-61dafb.svg)](https://reactjs.org/)
[![Bun](https://img.shields.io/badge/Bun-1.x-f9f1e1.svg)](https://bun.sh/)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)

[功能特性](#功能特性) • [快速开始](#快速开始) • [架构设计](#架构设计) • [使用场景](#使用场景) • [文档](#文档)

</div>

---

## 🎯 项目简介

Amigo 是一个专为复杂工作流设计的 AI 智能体编排系统。不同于传统的单一对话式 AI，Amigo 通过**层级化任务委派**和**多智能体协作**机制，让 AI 能够像团队一样工作——主智能体负责规划和协调，子智能体并行执行具体任务，最终汇总结果完成复杂目标。

### 为什么选择 Amigo？

- **🚀 真正的流式体验** - 基于 WebSocket 的双向通信，实时展示 AI 思考过程，无需等待完整响应
- **🧠 智能任务分解** - 自动将复杂任务拆解为可管理的子任务，并分配给专门的子智能体处理
- **🔄 动态工作流** - 智能体可以根据执行结果动态调整策略，支持中断、恢复和重试
- **🛠️ 高度可扩展** - 基于工具系统的插件化架构，轻松添加自定义能力（搜索、代码执行、API 调用等）
- **💾 完整的上下文管理** - 持久化对话历史和任务状态，支持长期记忆和会话恢复
- **⚡ 极致性能** - 采用 Bun 运行时和 Vite 构建，启动速度和运行效率远超传统方案

## ✨ 功能特性

### 核心能力

| 特性 | 说明 | 优势 |
|------|------|------|
| **实时双向通信** | WebSocket 长连接 + 流式响应 | 毫秒级延迟，即时反馈 AI 思考过程 |
| **层级任务管理** | 父子任务树形结构 | 清晰的任务依赖关系，支持并行执行 |
| **多智能体协作** | 主智能体 + 动态子智能体 | 专业分工，提高复杂任务完成质量 |
| **工具生态系统** | 可插拔的工具注册机制 | 快速扩展 AI 能力边界 |
| **持久化存储** | 基于文件的对话历史 | 零配置，支持会话恢复和审计 |
| **中断与恢复** | 任务级别的暂停/继续 | 用户可随时介入，引导 AI 方向 |

### 内置工具

- 🔍 **浏览器搜索** - 实时网络信息检索
- 📝 **任务分配** - 智能任务拆解与委派
- 💭 **思考链** - 可视化 AI 推理过程
- ✅ **待办清单** - 结构化任务跟踪
- 🎯 **完成报告** - 自动生成执行摘要

## 🏗️ 技术栈

Amigo 采用现代化的全栈技术方案，注重性能、开发体验和可维护性。

### 前端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| **React** | 18.x | 声明式 UI 框架，组件化开发 |
| **TypeScript** | 5.x | 类型安全，减少运行时错误 |
| **Vite** | 6.x | 极速冷启动和热更新 |
| **Tailwind CSS** | 4.x | 原子化 CSS，快速构建界面 |
| **DaisyUI** | - | 预设组件库，统一设计语言 |
| **Zustand** | - | 轻量级状态管理，零样板代码 |
| **Lucide React** | - | 现代化图标库 |

### 后端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| **Bun** | 1.x | 高性能 JavaScript 运行时（比 Node.js 快 3-4 倍） |
| **LangChain** | - | LLM 应用开发框架，简化 AI 集成 |
| **LangGraph** | - | 状态机编排，构建复杂 AI 工作流 |
| **Zod** | - | 运行时类型验证，确保数据安全 |
| **fast-xml-parser** | - | 高性能 XML 解析，处理工具调用 |

### 工程化

- **pnpm Workspace** - Monorepo 管理，共享依赖，加速安装
- **Biome** - 统一的代码格式化和 Lint 工具（比 ESLint + Prettier 快 25 倍）
- **TypeScript Strict Mode** - 最严格的类型检查，提前发现问题
- **Path Aliases** - `@/*` 路径映射，清晰的模块导入

## 项目结构

```
packages/
├── frontend/          # React 前端应用
│   ├── src/
│   │   ├── components/      # UI 组件
│   │   ├── messages/        # 消息处理逻辑
│   │   └── store/           # 状态管理
│   └── package.json
├── server/            # Bun 后端服务
│   ├── src/
│   │   ├── core/            # 核心功能
│   │   │   ├── conversationManager/  # 对话管理
│   │   │   ├── memory/               # 持久化存储
│   │   │   ├── tools/                # 智能体工具
│   │   │   └── systemPrompt/         # 系统提示词
│   │   └── utils/           # 工具函数
│   └── package.json
└── types/             # 共享类型定义
    ├── src/
    │   ├── conversation/    # 对话类型
    │   ├── tool/            # 工具参数类型
    │   └── websocketMessage/ # WebSocket 消息模式
    └── package.json
```

## 🚀 快速开始

### 前置要求

确保你的开发环境满足以下条件：

```bash
Node.js  >= 18.0.0
pnpm     >= 10.0.0
Bun      >= 1.0.0
```

### 一键安装

```bash
# 克隆项目
git clone https://github.com/your-org/amigo.git
cd amigo

# 安装所有依赖（Monorepo 自动处理）
pnpm install
```

### 配置环境

在 `packages/server/` 目录创建 `.env` 文件：

```env
# LLM 配置（必填）
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，自定义 API 端点

# 服务器配置（可选）
PORT=10013                    # WebSocket 服务端口
STORAGE_PATH=./storage        # 对话历史存储路径

# 日志配置（可选）
LOG_LEVEL=info                # debug | info | warn | error
```

### 启动服务

```bash
# 方式 1: 同时启动前后端（推荐）
pnpm dev

# 方式 2: 分别启动
pnpm --filter frontend start  # 前端: http://localhost:5173
pnpm --filter server start    # 后端: ws://localhost:10013
```

访问 `http://localhost:5173` 即可开始使用！

### 生产构建

```bash
# 构建所有包
pnpm build

# 或分别构建
pnpm --filter types build      # 先构建类型包（其他包依赖它）
pnpm --filter frontend build   # 构建前端静态资源
```

构建产物：
- 前端: `packages/frontend/dist/`
- 类型: `packages/types/dist/`

## 🎨 使用场景

Amigo 适用于需要 AI 深度参与的复杂工作流场景：

### 典型应用

| 场景 | 说明 | 示例 |
|------|------|------|
| **研究助手** | 多源信息检索与综合分析 | "分析最近三个月 AI 领域的重要进展" |
| **项目管理** | 任务拆解、分配与进度跟踪 | "制定新功能的开发计划并分配任务" |
| **内容创作** | 多步骤内容生成与优化 | "写一篇技术博客，包含调研、大纲、正文" |
| **数据分析** | 数据获取、处理、可视化 | "分析用户行为数据并生成报告" |
| **自动化运维** | 系统监控、问题诊断、修复 | "检查服务健康状态并修复异常" |

### 与传统 AI 对话的区别

| 维度 | 传统 AI 对话 | Amigo |
|------|-------------|-------|
| **任务复杂度** | 单轮问答 | 多步骤工作流 |
| **执行方式** | 一次性响应 | 流式 + 并行执行 |
| **上下文管理** | 有限的对话历史 | 完整的任务树和状态 |
| **可控性** | 被动接受结果 | 可中断、引导、恢复 |
| **扩展性** | 依赖模型能力 | 工具系统无限扩展 |

## 🏛️ 架构设计

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (React)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ ChatWindow   │  │ TaskRenderer │  │ MessageInput │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                   ┌────────▼────────┐                        │
│                   │  WebSocket      │                        │
│                   │  Provider       │                        │
│                   └────────┬────────┘                        │
└────────────────────────────┼──────────────────────────────────┘
                             │ WebSocket (ws://localhost:10013)
┌────────────────────────────▼──────────────────────────────────┐
│                      Backend (Bun)                            │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              WebSocket Server                        │    │
│  └────────┬─────────────────────────────────────────────┘    │
│           │                                                   │
│  ┌────────▼────────┐         ┌──────────────────┐           │
│  │ Message         │────────▶│ Conversation     │           │
│  │ Resolver        │         │ Manager          │           │
│  └─────────────────┘         └────────┬─────────┘           │
│                                        │                     │
│           ┌────────────────────────────┼──────────────┐      │
│           │                            │              │      │
│  ┌────────▼────────┐      ┌───────────▼──────┐  ┌───▼────┐ │
│  │ LLM Stream      │      │ Tool Executor    │  │ Memory │ │
│  │ Handler         │      │ (Sub-agents)     │  │ Store  │ │
│  └─────────────────┘      └──────────────────┘  └────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### 核心流程

#### 1. 消息处理流程

```
用户输入 → WebSocket → MessageResolver → ConversationManager
                                              ↓
                                         LLM Stream
                                              ↓
                                    XML Parser (工具调用)
                                              ↓
                                       Tool Executor
                                              ↓
                                    结果返回 → 前端渲染
                                              ↓
                                      Memory 持久化
```

#### 2. 任务委派流程

```
主智能体接收任务
    ↓
分析并拆解为子任务
    ↓
为每个子任务创建 ConversationManager
    ↓
并行执行子任务（独立的 LLM 会话）
    ↓
收集子任务结果
    ↓
主智能体汇总并返回最终结果
```

### 关键设计决策

#### 为什么选择 WebSocket？

- **实时性**: 毫秒级双向通信，无需轮询
- **流式传输**: 支持 Server-Sent Events 风格的流式响应
- **连接复用**: 一个连接处理所有消息，减少开销
- **状态保持**: 天然支持会话级别的状态管理

#### 为什么选择 Bun？

- **性能**: 启动速度比 Node.js 快 4 倍，内存占用更低
- **原生 WebSocket**: 无需第三方库，API 更简洁
- **TypeScript 原生支持**: 无需编译步骤，开发体验更好
- **兼容性**: 完全兼容 Node.js API，迁移成本低

#### 为什么使用 XML 格式的工具调用？

- **流式友好**: 可以边解析边执行，无需等待完整 JSON
- **容错性强**: 部分损坏的 XML 仍可解析
- **LLM 友好**: 大模型生成 XML 的准确率高于复杂 JSON
- **可读性**: 人类和机器都易于理解

## 开发指南

### 路径别名

使用 `@/*` 导入相对于 `src/` 目录的文件：

```typescript
import { logger } from "@/utils/logger"
```

### 代码规范

```bash
# 使用 Biome 格式化和检查代码
biome check --write .
```

### 命名约定

- 组件: PascalCase (例如: `ChatWindow.tsx`)
- 工具函数: camelCase (例如: `parseStreamingXml.ts`)
- 类型: PascalCase 接口/类型
- 文件: 与主要导出名称匹配

## 存储

对话数据持久化在 `packages/server/storage/` 目录。

## 许可证

ISC

## 贡献

欢迎提交 Issue 和 Pull Request！


## 📦 Server SDK

Amigo Server 提供了一套流式构建器 API，让你可以轻松配置和扩展服务器功能。

### 快速开始

```typescript
import { AmigoServerBuilder } from "@amigo/server";

const server = new AmigoServerBuilder()
  .port(8080)
  .storagePath("./my-storage")
  .build();

server.init();
```

### 核心 API

#### AmigoServerBuilder

流式构建器，用于配置服务器实例。

```typescript
import { AmigoServerBuilder } from "@amigo/server";

const server = new AmigoServerBuilder()
  // 设置服务器端口（默认 10013）
  .port(8080)
  
  // 设置会话持久化存储路径（默认 ./storage）
  .storagePath("./data")
  
  // 注册自定义工具
  .registerTool(myCustomTool)
  
  // 注册自定义消息类型
  .registerMessage(myCustomMessage)
  
  // 构建服务器实例
  .build();

// 启动服务器
server.init();
```

#### ServerConfig

服务器配置 Schema，使用 Zod 进行验证。

```typescript
import { ServerConfigSchema, type ServerConfig } from "@amigo/server";

// 配置项
interface ServerConfig {
  port: number;              // 端口号 (1-65535)，默认 10013
  storagePath: string;       // 存储路径，默认 "./storage"
  maxConnections?: number;   // 最大连接数（可选）
  heartbeatInterval?: number; // 心跳间隔（可选）
}

// 验证配置
const config = ServerConfigSchema.parse({
  port: 8080,
  storagePath: "./my-storage"
});
```

### 自定义工具

工具是 Amigo 的核心扩展机制，让 AI 智能体能够执行具体操作。

#### 工具接口定义

```typescript
interface ToolInterface<K extends ToolNames> {
  name: K;                    // 工具名称（唯一标识）
  description: string;        // 工具描述（LLM 用于理解工具用途）
  whenToUse: string;          // 使用场景说明
  params: ToolParam<K>[];     // 参数定义
  useExamples: string[];      // 使用示例（XML 格式）
  
  invoke: (props: {
    params: ToolParams<K>;                              // 解析后的参数
    getCurrentTask: () => string;                       // 获取当前任务 ID
    getToolFromName: (name: string) => ToolInterface;   // 获取其他工具
    signal?: AbortSignal;                               // 中断信号
    postMessage?: (msg: string | object) => void;       // 发送消息
  }) => Promise<{ message: string; toolResult: ToolResult<K> }>;
}
```

#### 创建自定义工具

**步骤 1: 定义工具 Schema** (`packages/types/src/tool/myTool.ts`)

```typescript
import { z } from "zod";

export const MyToolSchema = z.object({
  name: z.literal("myTool"),
  params: z.object({
    query: z.string(),
    options: z.object({
      limit: z.number().optional(),
    }).optional(),
  }),
  result: z.object({
    data: z.array(z.string()),
    total: z.number(),
  }),
});

export type MyToolParams = z.infer<typeof MyToolSchema>["params"];
export type MyToolResult = z.infer<typeof MyToolSchema>["result"];
```

**步骤 2: 实现工具逻辑** (`packages/server/src/core/tools/myTool.ts`)

```typescript
import { createTool } from "./base";
import { logger } from "@/utils/logger";

export const MyTool = createTool({
  name: "myTool",
  description: "执行自定义查询操作",
  whenToUse: "当用户需要查询特定数据时使用此工具",
  
  params: [
    {
      name: "query",
      optional: false,
      description: "查询关键词",
    },
    {
      name: "options",
      optional: true,
      description: "查询选项",
      type: "object",
      params: [
        {
          name: "limit",
          optional: true,
          description: "返回结果数量限制",
        },
      ],
    },
  ],
  
  useExamples: [
    `<myTool>
  <query>搜索关键词</query>
  <options>
    <limit>10</limit>
  </options>
</myTool>`,
  ],
  
  async invoke({ params, signal, postMessage }) {
    const { query, options } = params;
    
    logger.info(`[MyTool] 执行查询: ${query}`);
    
    // 检查中断信号
    if (signal?.aborted) {
      throw new Error("操作已取消");
    }
    
    // 发送进度消息（可选）
    postMessage?.({ type: "progress", data: { status: "processing" } });
    
    // 执行业务逻辑
    const results = await performQuery(query, options?.limit);
    
    return {
      message: `查询完成，找到 ${results.length} 条结果`,
      toolResult: {
        data: results,
        total: results.length,
      },
    };
  },
});
```

**步骤 3: 注册工具到 Schema** (`packages/types/src/tool/index.ts`)

```typescript
import { MyToolSchema } from "./myTool";

export const toolSchemas = z.discriminatedUnion("name", [
  // ... 其他工具
  MyToolSchema,
]);
```

**步骤 4: 通过 Builder 注册**

```typescript
import { AmigoServerBuilder } from "@amigo/server";
import { MyTool } from "./tools/myTool";

const server = new AmigoServerBuilder()
  .port(8080)
  .registerTool(MyTool)
  .build();
```

### 自定义消息类型

消息类型用于定义服务器与客户端之间的通信协议。

#### 定义消息

```typescript
import { defineMessage } from "@amigo/server";
import { z } from "zod";

// 定义自定义消息
const MyCustomMessage = defineMessage({
  type: "myCustomEvent",
  dataSchema: z.object({
    eventId: z.string(),
    payload: z.any(),
    timestamp: z.number(),
  }),
  // 可选：消息处理器
  handler: async (data) => {
    console.log("收到自定义消息:", data);
  },
});
```

#### 注册消息

```typescript
import { AmigoServerBuilder } from "@amigo/server";

const server = new AmigoServerBuilder()
  .port(8080)
  .registerMessage(MyCustomMessage)
  .build();
```

### 注册表 API

#### ToolRegistry

工具注册表，用于管理已注册的工具。

```typescript
import { ToolRegistry, RegistrationError } from "@amigo/server";

const registry = new ToolRegistry();

// 注册工具
registry.register(myTool);

// 获取工具
const tool = registry.get("myTool");

// 检查工具是否存在
if (registry.has("myTool")) {
  // ...
}

// 获取所有工具
const allTools = registry.getAll();

// 获取工具数量
console.log(`已注册 ${registry.size} 个工具`);
```

#### MessageRegistry

消息注册表，用于管理自定义消息类型。

```typescript
import { MessageRegistry } from "@amigo/server";

const registry = new MessageRegistry();

// 注册消息
registry.register(myMessage);

// 获取消息定义
const message = registry.get("myCustomEvent");

// 获取所有消息 Schema（用于合并验证）
const schemas = registry.getAllSchemas();
```

### 错误处理

```typescript
import { ValidationError, RegistrationError } from "@amigo/server";

try {
  const server = new AmigoServerBuilder()
    .port(99999) // 无效端口
    .build();
} catch (error) {
  if (error instanceof ValidationError) {
    console.error("配置验证失败:", error.details);
  }
}

try {
  registry.register(duplicateTool);
} catch (error) {
  if (error instanceof RegistrationError) {
    console.error("注册失败:", error.message);
  }
}
```

### 完整示例

```typescript
import path from "node:path";
import dotenv from "dotenv";
import { AmigoServerBuilder, defineMessage } from "@amigo/server";
import { z } from "zod";
import { MyTool } from "./tools/myTool";

dotenv.config();

// 定义自定义消息
const AnalyticsMessage = defineMessage({
  type: "analytics",
  dataSchema: z.object({
    event: z.string(),
    properties: z.record(z.any()),
  }),
});

// 配置
const PORT = Number(process.env.SERVER_PORT) || 10013;
const STORAGE_PATH = process.env.STORAGE_PATH || path.resolve(process.cwd(), "storage");

// 构建服务器
const server = new AmigoServerBuilder()
  .port(PORT)
  .storagePath(STORAGE_PATH)
  .registerTool(MyTool)
  .registerMessage(AnalyticsMessage)
  .build();

// 启动
server.init();

console.log(`Amigo Server 已启动: ws://localhost:${PORT}`);
```

### 导出清单

```typescript
// 从 @amigo/server 导出
export {
  // 构建器
  AmigoServerBuilder,
  
  // 服务器
  AmigoServer,
  type AmigoServerOptions,
  
  // 配置
  ServerConfigSchema,
  type ServerConfig,
  ValidationError,
  
  // 注册表
  ToolRegistry,
  MessageRegistry,
  RegistrationError,
  
  // 消息定义
  defineMessage,
  type MessageDefinition,
  type MessageSchema,
};
```

---

## 📚 开发指南

### 项目规范

#### 路径别名

使用 `@/*` 导入模块，保持代码整洁：

```typescript
// ✅ 推荐
import { logger } from "@/utils/logger"
import { ConversationManager } from "@/core/conversationManager"

// ❌ 避免
import { logger } from "../../../utils/logger"
```

#### 命名约定

```typescript
// 组件 - PascalCase
ChatWindow.tsx
MessageRenderer.tsx

// 工具函数 - camelCase
parseStreamingXml.ts
createWebSocketServer.ts

// 类型/接口 - PascalCase
interface ConversationState { }
type MessageType = "text" | "tool"

// 常量 - UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3
const DEFAULT_PORT = 10013
```

#### 代码质量

```bash
# 格式化和 Lint（自动修复）
biome check --write .

# 仅检查（不修复）
biome check .

# 类型检查
pnpm --filter frontend tsc --noEmit
pnpm --filter server tsc --noEmit
```

### 调试技巧

#### 查看 WebSocket 消息

```typescript
// 前端 (packages/frontend/src/store/websocket.ts)
console.log("发送消息:", message)

// 后端 (packages/server/src/core/server/index.ts)
console.log("接收消息:", data)
```

#### 查看 LLM 流式输出

```typescript
// packages/server/src/core/conversationManager/StreamHandler.ts
console.log("LLM chunk:", chunk.content)
```

#### 查看工具调用

```typescript
// packages/server/src/core/conversationManager/ToolExecutor.ts
console.log("执行工具:", toolName, params)
```

## 📂 数据存储

### 存储结构

```
packages/server/storage/
├── conversations/
│   ├── {conversationId}/
│   │   ├── metadata.json      # 对话元数据
│   │   ├── messages.jsonl     # 消息历史（每行一条）
│   │   └── state.json         # 对话状态
│   └── ...
└── tasks/
    ├── {taskId}/
    │   ├── info.json          # 任务信息
    │   └── subtasks.json      # 子任务列表
    └── ...
```

### 数据格式

#### 消息格式 (messages.jsonl)

```jsonl
{"id":"msg_1","type":"user","content":"帮我分析一下...","timestamp":1701234567890}
{"id":"msg_2","type":"assistant","content":"好的，我来分析...","timestamp":1701234568123}
{"id":"msg_3","type":"tool_call","tool":"browser_search","params":{...},"timestamp":1701234569456}
```

#### 对话元数据 (metadata.json)

```json
{
  "id": "conv_abc123",
  "title": "数据分析任务",
  "createdAt": 1701234567890,
  "updatedAt": 1701234789012,
  "messageCount": 15,
  "parentTaskId": null
}
```

## 🔒 安全性

### API 密钥管理

- ✅ 使用 `.env` 文件存储敏感信息
- ✅ `.env` 已加入 `.gitignore`，不会提交到版本控制
- ✅ 生产环境使用环境变量注入

### WebSocket 安全

```typescript
// 建议在生产环境添加认证中间件
server.on("upgrade", (req, socket, head) => {
  const token = req.headers["authorization"]
  if (!isValidToken(token)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
    socket.destroy()
    return
  }
  // 继续 WebSocket 握手
})
```

### 输入验证

所有工具参数都通过 Zod Schema 验证：

```typescript
// 自动验证，无效参数会抛出错误
const params = YourToolParamsSchema.parse(rawInput)
```

## 🚢 部署

### Docker 部署（推荐）

```dockerfile
# Dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# 安装依赖
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json ./packages/server/
COPY packages/types/package.json ./packages/types/
RUN bun install --frozen-lockfile

# 构建
COPY . .
RUN bun run build

# 运行
EXPOSE 10013
CMD ["bun", "run", "packages/server/src/index.ts"]
```

```bash
# 构建镜像
docker build -t amigo:latest .

# 运行容器
docker run -d \
  -p 10013:10013 \
  -e OPENAI_API_KEY=your_key \
  -v $(pwd)/storage:/app/packages/server/storage \
  amigo:latest
```

### 传统部署

```bash
# 1. 构建前端
pnpm --filter frontend build

# 2. 使用 Nginx 托管前端静态文件
# /etc/nginx/sites-available/amigo
server {
  listen 80;
  server_name your-domain.com;
  
  root /var/www/amigo/frontend/dist;
  index index.html;
  
  location / {
    try_files $uri $uri/ /index.html;
  }
  
  # WebSocket 代理
  location /ws {
    proxy_pass http://localhost:10013;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}

# 3. 使用 PM2 运行后端
pm2 start packages/server/src/index.ts --interpreter bun --name amigo-server
pm2 save
pm2 startup
```

## 🤝 贡献指南

我们欢迎所有形式的贡献！

### 贡献方式

- 🐛 **报告 Bug** - 提交 Issue 描述问题和复现步骤
- 💡 **功能建议** - 分享你的想法和使用场景
- 📝 **改进文档** - 修正错误或补充说明
- 🔧 **提交代码** - Fork 项目并发起 Pull Request

### 开发流程

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 发起 Pull Request

### 代码审查标准

- ✅ 通过所有类型检查 (`tsc --noEmit`)
- ✅ 通过 Biome 检查 (`biome check .`)
- ✅ 添加必要的注释和文档
- ✅ 保持向后兼容（除非是 Breaking Change）

## 📄 许可证

本项目采用 [ISC License](LICENSE) 开源协议。

## 🙏 致谢

感谢以下开源项目：

- [React](https://reactjs.org/) - 用户界面库
- [Bun](https://bun.sh/) - 高性能 JavaScript 运行时
- [LangChain](https://www.langchain.com/) - LLM 应用开发框架
- [Tailwind CSS](https://tailwindcss.com/) - 原子化 CSS 框架
- [Biome](https://biomejs.dev/) - 快速的代码格式化和 Lint 工具

## 📮 联系我们

- **Issues**: [GitHub Issues](https://github.com/your-org/amigo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/amigo/discussions)
- **Email**: support@amigo.dev

---

<div align="center">

**[⬆ 回到顶部](#amigo)**

Made with ❤️ by Amigo Team

</div>
