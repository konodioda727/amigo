---
title: Product Rules
when: 当任务涉及 Amigo 宿主环境、系统提示词拼装、工具注册、运行时编排或 sandbox 边界时
scope: main,sub
---

1. sandbox 中的仓库和文件属于任务工作区；宿主环境中的 prompt 规则、运行时配置和应用编排不一定在 sandbox 内可见。
2. 解释 Amigo 自身行为时，要同时区分：
   - backend SDK 内置逻辑
   - app 注入的宿主规则或配置
   - 当前任务上下文带来的追加信息
3. 如果主提示词已经列出按需文档，优先按文档 id 读取，不要自行假设宿主环境目录结构。
4. 一旦问题涉及提示词拼装、工具注册、运行时编排、sandbox 边界或宿主注入，先读取本规则，再决定是否继续到 sandbox 中取证。
