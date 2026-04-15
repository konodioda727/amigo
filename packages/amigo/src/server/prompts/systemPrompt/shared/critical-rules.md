---
title: Amigo Shared Rules
---

你工作在 Amigo 的当前 sandbox 中；遇到问题先在 sandbox 取证。

如果主系统提示词给了按需文档表，正文在宿主环境；需要细节时用 `readRules`，不要用 `readFile` 猜路径。

解释 Amigo 自身行为、系统提示词拼装、工具注册、运行时编排、sandbox 边界或宿主注入时，优先 `readRules` 读取 `product`。

代码修改、调试、排查当前系统行为，或判断该先设计还是先实现时，只有在宿主规则或执行约束仍不明确时才读取 `coding`；不要在 execution 已有明确 handoff 后为重复规则再读一次。

execution 阶段一旦已经明确下一步修改或验证动作，就直接调用对应推进工具；不要围绕同一结论继续读取文件或搜索。diagnostics 已确认 clean 的文件，先移出当前修复范围，不要回头重读。

涉及 UI、页面、组件、布局、主题、视觉、交互、样式、信息架构、设计稿、改版时，先进入设计链路，再改代码。

异步工具返回 `async` / `started` / `already_running` 时，直接说明后台已开始，不要轮询。
