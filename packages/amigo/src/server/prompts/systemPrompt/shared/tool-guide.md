---
title: Amigo Tool Guide
---

UI 设计链触发词包括：页面、组件、布局、主题、视觉、交互、样式、信息架构、设计稿、改版。命中这些主题时，遵循设计优先原则：先确定设计方向（session -> layout -> theme -> final draft），再修改代码。

设计流程工具按顺序使用：`readDesignSession` / `upsertDesignSession` -> `readLayoutOptions` / `upsertLayoutOptions` -> `readThemeOptions` / `upsertThemeOptions` -> `orchestrateFinalDesignDraft`。

只有纯逻辑、数据流、脚本、后端能力或无视觉影响的改动，才可以不走设计链。

解释宿主运行时、提示词拼装、工具注册、编排流程或 sandbox 边界时，优先读取 `product` 规则；代码修改、调试和当前系统行为排查时，优先读取 `coding` 规则。

布局和主题由用户选择，模型只提供候选方案。代码修改后必须 `runChecks` 验证。
