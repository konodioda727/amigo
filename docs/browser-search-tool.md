# 浏览器检索工具 (Browser Search Tool)

## 概述

浏览器检索工具允许 AI 模型通过浏览器搜索信息、访问网页或提取页面内容。

## 功能

1. **搜索信息** - 使用搜索引擎查找相关信息
2. **访问网页** - 直接访问特定的 URL
3. **提取内容** - 从当前页面提取文本内容

## 使用方法

### 1. 搜索信息

```xml
<browserSearch>
  <query>React 19 新特性</query>
  <action>search</action>
</browserSearch>
```

### 2. 访问特定网页

```xml
<browserSearch>
  <url>https://react.dev</url>
  <action>navigate</action>
</browserSearch>
```

### 3. 提取页面内容

```xml
<browserSearch>
  <action>extract</action>
</browserSearch>
```

## 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 否 | 搜索查询关键词（action 为 search 时必填） |
| `url` | string | 否 | 要访问的网页 URL（action 为 navigate 时必填） |
| `action` | enum | 否 | 操作类型：`search`（搜索）、`navigate`（访问URL）、`extract`（提取内容），默认为 `search` |

## 返回结果

```typescript
{
  content: string;      // 提取的网页内容或搜索结果
  url?: string;         // 访问的 URL
  title?: string;       // 页面标题
}
```

## 实现位置

- **类型定义**: `packages/types/src/tool/browserSearch.ts`
- **服务端工具**: `packages/server/src/core/tools/browserSearch.ts`
- **前端渲染器**: `packages/frontend/src/components/MessageRenderers/toolRenderer/browserSearch.tsx`

## 扩展建议

当前实现返回模拟数据。要实现真实的浏览器功能，可以：

1. **集成 Puppeteer** - 用于浏览器自动化
   ```bash
   cd packages/server
   pnpm add puppeteer
   ```

2. **集成搜索 API** - 如 Google Custom Search API、Bing Search API 等

3. **添加内容解析** - 使用 cheerio 或其他 HTML 解析库提取结构化内容

## 示例场景

- 查询最新技术文档
- 获取实时新闻信息
- 提取网页中的特定数据
- 验证链接的有效性
- 获取网站的元数据
