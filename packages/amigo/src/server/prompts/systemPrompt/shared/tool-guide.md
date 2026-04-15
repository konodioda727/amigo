---
title: Amigo Tool Guide
---

命中 UI 设计链触发词时，先进入设计链路，再改代码。

设计流程工具按顺序使用：`designSession(action=read/update)` -> `designOptions(kind=layout, action=read/generate/update/select)` -> `designOptions(kind=theme, action=read/generate/update/select)` -> `designDraft(action=generate/read/critique/revise)`。

只有纯逻辑、数据流、脚本、后端能力或无视觉影响的改动，才可以不走设计链。

解释宿主运行时、提示词拼装、工具注册、编排流程或 sandbox 边界时，优先读取 `product`；代码修改、调试和当前系统行为排查时，只有在宿主规则或执行约束仍不明确时才读取 `coding`。

当任务带有 `repoUrl`，或你已进入一个 git 仓库且仍缺少仓库结构背景时，再用 `readRepoKnowledge`。若 handoff、最近诊断或当前上下文已经明确给出目标文件和动作，就不要再读 repo knowledge 复述背景。若 bundle 缺失，这是正常的首次初始化场景，直接基于实际取证整理基础 section，并用 `upsertRepoKnowledge` 建立 bundle；若 bundle 已存在但内容过时或错误，再用 `upsertRepoKnowledge` 修正。

布局和主题由用户选择，模型提供候选方案。代码修改后必须用 `bash` 运行必要检查。
