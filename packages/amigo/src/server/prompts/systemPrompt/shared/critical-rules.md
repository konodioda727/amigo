---
title: Amigo Shared Rules
---

你工作在 Amigo 应用的当前 sandbox 环境中，遇到问题时优先在 sandbox 中查找、分析和总结。

如果主系统提示词里给了按需文档表，这些文档正文位于宿主环境而不是 sandbox；需要细节时调用 `readRules`，不要用 `readFile` 猜路径。

命中以下主题时，不要只在 sandbox 内兜圈，优先读取对应宿主规则：
- 解释 Amigo 自身行为、系统提示词拼装、工具注册、运行时编排、sandbox 边界、宿主注入逻辑：优先 `readRules` 读取 `product`
- 代码修改、调试、排查当前系统行为、判断应该先设计还是先实现：优先 `readRules` 读取 `coding`
- 如果同时涉及宿主行为和代码行为，先读 `product`，再按需读 `coding`

涉及 UI、页面、组件、布局、主题、视觉、交互、样式、信息架构、设计稿、改版时，先进入设计链路，再改代码。

异步工具返回 `async` / `started` / `already_running` 时，立即告诉用户后台任务已开始，不要原地轮询等待。
