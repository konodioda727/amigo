# Tasks: 重构错误消息组件

## Phase 1: Setup

- [ ] T001 确认开发环境已安装依赖（react, react-dom, tailwindcss, lucide-react）及 linter 配置

## Phase 2: Foundational

- [ ] T002 检查并备份 packages/frontend/src/components/renderers/ErrorRenderer.tsx 现有实现
- [ ] T003 检查并备份 packages/frontend/tailwind.config.js 和 packages/frontend/src/styles/tokens.css

## Phase 3: User Story 1 - 视觉友好的错误提示 (P1)

- [ ] T004 [US1] 优化 ErrorRenderer.tsx 结构与样式，使用柔和背景、统一图标、清晰分隔的标题与内容（packages/frontend/src/components/renderers/ErrorRenderer.tsx）
- [ ] T005 [P] [US1] 调整 Tailwind 配置或 tokens，确保所有颜色、圆角、间距均用统一变量（packages/frontend/tailwind.config.js, packages/frontend/src/styles/tokens.css）
- [ ] T006 [US1] 手动或自动测试不同错误类型下的视觉一致性

## Phase 4: User Story 2 - 响应式与可访问性 (P2)

- [ ] T007 [US2] 检查并优化 ErrorRenderer.tsx 响应式布局，适配移动端与桌面端（packages/frontend/src/components/renderers/ErrorRenderer.tsx）
- [ ] T008 [US2] 增强可访问性，确保屏幕阅读器能正确朗读错误信息（packages/frontend/src/components/renderers/ErrorRenderer.tsx）
- [ ] T009 [US2] 测试不同分辨率和辅助工具下的显示与可读性

## Final Phase: Polish & Cross-Cutting

- [ ] T010 代码自查与重构，确保无冗余样式或逻辑（packages/frontend/src/components/renderers/ErrorRenderer.tsx）
- [ ] T011 通过 linter、格式化和单元测试（packages/frontend）
- [ ] T012 更新相关文档与变更记录（specs/001-refactor-error-message/）

## Dependencies

- Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Final Phase

## Parallel Execution Examples

- T005（样式 tokens 优化）可与 T004（组件结构优化）并行
- T008（可访问性增强）可与 T007（响应式优化）并行

## Implementation Strategy

- 先完成 P1 用户故事（US1），实现 MVP
- 后续增量交付响应式与可访问性优化（US2）
- 每阶段均可独立测试与交付
