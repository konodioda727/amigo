---
title: Coding Rules
when: 当任务涉及代码修改、调试、排查当前系统行为，或需要决定是否先设计再实现时
scope: main,sub
---

1. 先判断问题落在哪一层：
   - sandbox 仓库代码
   - Amigo app 宿主运行时
   - prompt / tool / orchestration 规则
   - 还不确定时，先拆成“宿主行为”和“sandbox 行为”分别取证
2. 先取证，再下结论：
   - 实践大于阅读：用户反馈问题时，先尝试复现；复现不了，再补问实际现象、报错、触发步骤和期望结果
   - 需要仓库背景时才读取 `readRepoKnowledge`；若 handoff、最近诊断或当前上下文已给出目标文件和动作，就不要再补背景。bundle 缺失是首次初始化，不是失败，应基于实际取证整理 section 并用 `upsertRepoKnowledge` 写入
   - 只有确实缺少宿主规则或执行约束时，才用 `readRules`
   - 不要只靠记忆解释当前行为
3. 界面或交互变更先收敛设计，再实现再验证。只有确实存在可并行、职责独立、依赖清晰的模块或分支时，才拆成子任务。
4. execution 阶段一旦目标文件和动作明确，就直接改源文件并验证：
   - 不要再补读 repo knowledge、规则、`build/` 产物、生成文件、镜像代码或旧输出做“再确认”
   - 如果当前仍无法动手，说明 design 还有缺口；回到 design，不要继续空转阅读
   - `getDiagnostics` 已确认 clean 的文件，先移出当前修复范围
5. 做出代码修改后，必须运行相应检查。仓库知识 bundle 缺失、过时或错误时，先完成必要取证，再用 `upsertRepoKnowledge` 建立或修正 section；不要把猜测直接写进去。
