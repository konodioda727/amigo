# Requirements Document

## Introduction

This feature enhances the message input system to support multi-session communication through an upgraded Tiptap-based rich text editor. The system will allow users to direct messages to specific conversation sessions (main or sub-tasks) and provide better interrupt control when multiple sessions are active.

## Glossary

- **Main Session**: The primary conversation thread managed by the main agent
- **Sub Session**: A child conversation thread spawned by the main session through assignTask tool
- **Tiptap Editor**: A headless rich text editor framework for building custom input experiences
- **Mention System**: A UI pattern that allows users to reference entities (in this case, sessions) using `/` or `@` triggers
- **Session Selector**: A UI component that displays and allows selection of the target conversation session
- **Interrupt Action**: A user-initiated action to stop ongoing LLM streaming and task execution
- **Input System**: The message input component and its associated state management
- **WebSocket Provider**: The React context that manages WebSocket connection and message routing

## Requirements

### Requirement 1

**User Story:** As a user managing multiple sub-tasks, I want to send messages to specific sessions, so that I can interact with different agents independently

#### Acceptance Criteria

1. WHEN the user types `/` in the Tiptap editor, THE Input System SHALL display a mention dropdown showing all active sessions (main and sub-tasks)
2. WHEN the user selects a session from the mention dropdown, THE Input System SHALL tag the message with the selected session identifier
3. WHEN the user submits a message with a session tag, THE WebSocket Provider SHALL route the message to the specified session
4. WHERE no session is explicitly selected, THE Input System SHALL default to the main session
5. WHILE multiple sessions are active, THE Session Selector SHALL display the currently selected target session above the input box

### Requirement 2

**User Story:** As a user with active sub-tasks, I want to interrupt all running sessions at once, so that I can regain control when needed

#### Acceptance Criteria

1. WHEN any sub-task is actively streaming output, THE Input System SHALL display the send button in interrupt mode
2. WHEN the user clicks the interrupt button while sub-tasks are active, THE WebSocket Provider SHALL send interrupt signals to all active sub-sessions first
3. WHEN all sub-session interrupts are acknowledged, THE WebSocket Provider SHALL send an interrupt signal to the main session
4. WHILE the interrupt sequence is in progress, THE Input System SHALL disable further message submission
5. WHEN all interrupts are completed, THE Input System SHALL restore normal send button state

### Requirement 3

**User Story:** As a user responding to followup questions, I want to input custom text in addition to selecting predefined options, so that I can provide more specific answers

#### Acceptance Criteria

1. WHEN an askFollowupQuestion tool is displayed, THE Input System SHALL remain enabled for text input
2. WHEN the user types a custom response in the input box during a followup question, THE Input System SHALL send the custom text as the response
3. WHEN the user selects a predefined option during a followup question, THE Input System SHALL send the selected option as the response
4. THE Input System SHALL support both custom text input and option selection for followup questions
5. WHEN a followup question is active, THE Session Selector SHALL automatically target the session that asked the question

### Requirement 4

**User Story:** As a user, I want a seamless transition from the current input to Tiptap, so that existing functionality remains intact

#### Acceptance Criteria

1. THE Tiptap Editor SHALL support all existing input features including multiline text and keyboard shortcuts
2. WHEN the user presses Enter without Shift, THE Input System SHALL submit the message (maintaining current behavior)
3. WHEN the user presses Shift+Enter, THE Tiptap Editor SHALL insert a line break
4. THE Tiptap Editor SHALL maintain the current styling and visual appearance of the input box
5. THE Input System SHALL preserve existing WebSocket message format and routing logic for backward compatibility

### Requirement 5

**User Story:** As a user, I want visual feedback about which session I'm communicating with, so that I don't send messages to the wrong conversation

#### Acceptance Criteria

1. THE Session Selector SHALL display the name or identifier of the currently selected session
2. WHEN a sub-task is selected, THE Session Selector SHALL show the sub-task title or ID
3. WHEN the main session is selected, THE Session Selector SHALL show "Main Session" or equivalent label
4. THE Session Selector SHALL use distinct visual styling to differentiate between main and sub-sessions
5. WHEN the user changes the selected session, THE Session Selector SHALL update immediately to reflect the change
