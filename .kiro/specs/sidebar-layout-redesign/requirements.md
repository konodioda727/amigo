# Requirements Document

## Introduction

本功能将 Amigo 的页面布局从当前的单列垂直布局重构为现代化的侧边栏布局，类似于豆包、Gemini 等主流 AI 聊天应用。主要变更包括：将会话历史移至左侧边栏、添加新建对话按钮、重新设计输入框样式使其更现代化、增加页面底部边距。

## Glossary

- **Sidebar**: 左侧边栏组件，包含会话历史列表和新建对话按钮
- **Chat Area**: 右侧主聊天区域，包含消息展示和输入框
- **Message Input**: 消息输入组件，用户在此输入并发送消息
- **Conversation History**: 会话历史列表，显示所有历史对话

## Requirements

### Requirement 1

**User Story:** As a user, I want the conversation history to be displayed in a left sidebar, so that I can easily navigate between conversations while viewing the current chat.

#### Acceptance Criteria

1. WHEN the application loads THEN the Layout SHALL display a left sidebar containing the conversation history list
2. WHEN the application is rendered THEN the Layout SHALL display the sidebar with a fixed width of 260px
3. WHEN a user clicks on a conversation in the sidebar THEN the Layout SHALL switch to that conversation in the main chat area
4. WHILE the sidebar is visible THEN the Layout SHALL maintain the sidebar position fixed during scroll

### Requirement 2

**User Story:** As a user, I want a "New Conversation" button in the sidebar, so that I can quickly start a new chat session.

#### Acceptance Criteria

1. WHEN the sidebar is displayed THEN the Sidebar SHALL show a "New Conversation" button at the top
2. WHEN a user clicks the "New Conversation" button THEN the System SHALL create a new conversation session and clear the chat area
3. WHEN a new conversation is created THEN the System SHALL focus the message input field

### Requirement 3

**User Story:** As a user, I want a modern-styled message input box, so that the interface feels contemporary and pleasant to use.

#### Acceptance Criteria

1. WHEN the chat area is displayed THEN the Message Input SHALL have rounded corners with a minimum radius of 16px
2. WHEN the chat area is displayed THEN the Message Input SHALL have a subtle border and shadow for depth
3. WHEN the input field receives focus THEN the Message Input SHALL display a visual focus indicator
4. WHEN the chat area is displayed THEN the Message Input SHALL be positioned at the bottom of the chat area with adequate padding
5. WHEN the chat area is displayed THEN the Message Input SHALL include action buttons (attachments, send) with icon-only style

### Requirement 4

**User Story:** As a user, I want increased bottom margin in the chat area, so that the content doesn't feel cramped against the input box.

#### Acceptance Criteria

1. WHEN messages are displayed THEN the Chat Area SHALL maintain a minimum bottom padding of 120px above the input box
2. WHEN the input box is displayed THEN the Chat Area SHALL position the input with at least 24px margin from the viewport bottom



