# Implementation Plan

- [ ] 1. 创建 Sidebar 组件和布局结构
  - 创建 `Sidebar.tsx` 组件，包含固定定位和样式
  - 创建 `MainContent.tsx` 组件作为右侧内容容器
  - 更新 `App.tsx`，采用新的侧边栏布局结构
  - _Requirements: 1.1, 1.2, 1.4_

- [ ] 1.1 编写 Sidebar 组件的单元测试
  - 测试 Sidebar 渲染
  - 测试侧边栏宽度为 260px
  - _Requirements: 1.2_

- [ ] 2. 创建 NewChatButton 组件
  - 创建 `NewChatButton.tsx` 组件
  - 实现点击创建新对话的功能
  - 添加 Plus 图标和"新建对话"文字
  - 应用浅色背景和虚线边框样式
  - _Requirements: 2.1, 2.2_

- [x] 2.1 在 WebSocketProvider 中添加 createNewConversation 方法
  - 实现清空当前会话的逻辑
  - 生成新的 taskId
  - 清空 displayMessages
  - _Requirements: 2.2_

- [x] 2.2 实现新建对话后自动聚焦输入框
  - 在 MessageInput 组件中暴露 focus 方法
  - NewChatButton 点击后调用 focus
  - _Requirements: 2.3_

- [ ]* 2.3 编写 NewChatButton 的单元测试
  - 测试按钮渲染
  - 测试点击事件触发
  - _Requirements: 2.1, 2.2_

- [x] 3. 重构 ConversationHistory 组件
  - 移除现有的标题和外层容器样式
  - 调整为适配侧边栏的样式
  - 确保会话列表在侧边栏中正确显示
  - _Requirements: 1.1, 1.3_

- [x] 4. 重新设计 MessageInput 样式
  - 更新输入框圆角为 16px 或更大
  - 添加 box-shadow 阴影效果
  - 调整输入框容器的最大宽度为 800px 并居中
  - 更新底部边距为 24px
  - 优化按钮图标样式（附件、发送等）
  - _Requirements: 3.1, 3.2, 3.4, 3.5_

- [x] 4.1 更新 MessageInput 的 styles.ts
  - 修改 `.tiptap-editor-wrapper` 的圆角和阴影
  - 调整容器布局和间距
  - _Requirements: 3.1, 3.2_

- [ ]* 4.2 编写 MessageInput 样式的单元测试
  - 验证圆角至少 16px
  - 验证存在 box-shadow
  - 验证底部边距【
  - _Requirements: 3.1, 3.2, 3.4_

- [ ] 5. 调整 ChatWindow 底部间距
  - 增加 ChatWindow 的底部 padding 为 120px
  - 确保消息内容不会被输入框遮挡
  - _Requirements: 4.1_

- [ ] 6. 更新 App.tsx 的整体布局
  - 移除原有的居中容器和最大宽度限制
  - 采用全屏布局，左侧 Sidebar + 右侧 MainContent
  - 移除页面标题"Amigo WebSocket 测试"
  - 调整主内容区的左边距以适配侧边栏宽度
  - _Requirements: 1.1, 1.2_

- [ ]* 6.1 编写属性测试验证侧边栏宽度
  - **Property 1: Sidebar width consistency**
  - **Validates: Requirements 1.2**

- [ ] 7. Checkpoint - 确保所有功能正常
  - Ensure all tests pass, ask the user if questions arise.
