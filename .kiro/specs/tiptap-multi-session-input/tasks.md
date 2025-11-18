# Implementation Plan

- [ ] 1. Install and configure Tiptap dependencies
  - Add @tiptap/react, @tiptap/starter-kit, @tiptap/extension-mention, @tiptap/extension-placeholder to frontend package.json
  - Verify installation and build compatibility
  - _Requirements: 4.1, 4.4_

- [ ] 2. Create basic TiptapMessageInput component
  - [x] 2.1 Create TiptapMessageInput.tsx component file
    - Initialize Tiptap editor with starter-kit
    - Add placeholder extension with "输入消息..." text
    - Implement basic text input and output
    - _Requirements: 4.1, 4.4_

  - [x] 2.2 Implement keyboard shortcuts
    - Add Enter key handler to submit message (without Shift)
    - Add Shift+Enter handler for line breaks
    - Maintain existing keyboard behavior from MessageInput
    - _Requirements: 4.2, 4.3_

  - [x] 2.3 Style editor to match existing input
    - Apply Tailwind/DaisyUI classes for consistent appearance
    - Match textarea-bordered styling
    - Ensure proper flex-grow behavior
    - _Requirements: 4.4_

  - [x] 2.4 Integrate with existing WebSocket context
    - Use useWebSocket hook for sendMessage and displayMessages
    - Preserve existing message sending logic
    - Maintain button state management (send/stop/resume)
    - _Requirements: 4.5_

- [ ] 3. Implement mention extension for session selection
  - [x] 3.1 Configure Mention extension
    - Set trigger character to "/"
    - Create mention suggestion component
    - Style dropdown with DaisyUI classes
    - _Requirements: 1.1_

  - [x] 3.2 Build session suggestion list
    - Create getSuggestions function to filter active sessions
    - Render main session and sub-tasks in dropdown
    - Add icons to differentiate session types (🏠 for main, 📋 for subtasks)
    - _Requirements: 1.1, 5.2, 5.3, 5.4_

  - [x] 3.3 Handle mention selection
    - Store selected session ID in editor state
    - Insert mention node with session label
    - Update targetSessionId state when mention is selected
    - _Requirements: 1.2_

  - [x] 3.4 Extract session ID from editor content
    - Parse editor content for mention nodes
    - Extract session ID from mention attributes
    - Pass targetSessionId to sendMessage function
    - _Requirements: 1.3_

- [ ] 4. Create SessionSelector component
  - [ ] 4.1 Build SessionSelector UI component
    - Create component with dropdown for session selection
    - Display currently selected session above input
    - Show session type icon and title
    - _Requirements: 1.5, 5.1, 5.2, 5.3_

  - [ ] 4.2 Implement session switching logic
    - Add onSessionChange handler
    - Update targetSessionId in parent component
    - Sync with mention system
    - _Requirements: 1.4, 5.5_

  - [ ] 4.3 Add visual styling for session types
    - Use distinct colors/badges for main vs subtask
    - Show active/inactive status
    - Highlight followup question sessions
    - _Requirements: 5.4_

- [ ] 5. Enhance WebSocketProvider for session management
  - [ ] 5.1 Add active session tracking
    - Create getActiveSessions function to collect main and sub-task sessions
    - Parse displayMessages for assignTask tool calls
    - Maintain activeSessions state array
    - _Requirements: 1.1, 1.5_

  - [ ] 5.2 Track active sub-task IDs
    - Create activeSubTaskIds state
    - Update when assignTask messages arrive
    - Remove when sub-tasks complete
    - _Requirements: 2.1_

  - [ ] 5.3 Implement enhanced message routing
    - Update sendMessage to accept optional targetSessionId parameter
    - Route messages to specified session instead of default taskId
    - Maintain backward compatibility (default to taskId if no target)
    - _Requirements: 1.3, 1.4, 4.5_

  - [ ] 5.4 Add interruptAll cascade function
    - Collect all active sub-task IDs
    - Send interrupt to each sub-task sequentially
    - Wait for ack or timeout (3s) for each
    - Finally interrupt main session
    - _Requirements: 2.2, 2.3_

  - [ ] 5.5 Expose new context values
    - Add activeSessions to WebSocketContextType
    - Add activeSubTaskIds to context
    - Add interruptAll function to context
    - Update context provider value
    - _Requirements: 2.1, 2.2_

- [ ] 6. Update button state logic for sub-task awareness
  - [ ] 6.1 Detect active sub-tasks in button state logic
    - Check activeSubTaskIds in useEffect
    - Set button to "interrupt" mode when any sub-task is active
    - Maintain existing logic for main session states
    - _Requirements: 2.1_

  - [ ] 6.2 Implement interrupt button handler
    - Call interruptAll when button clicked in interrupt mode
    - Show loading state during cascade interrupt
    - Disable input during interrupt sequence
    - _Requirements: 2.2, 2.4_

  - [ ] 6.3 Handle interrupt completion
    - Listen for all interrupt acknowledgments
    - Restore normal button state after completion
    - Show error toast if interrupts fail
    - _Requirements: 2.5_

- [ ] 7. Enable input during followup questions
  - [ ] 7.1 Update askFollowupQuestion renderer
    - Keep input enabled when followup question is displayed
    - Show both predefined options and text input
    - Add visual indicator that custom text is allowed
    - _Requirements: 3.1, 3.4_

  - [ ] 7.2 Handle custom text responses
    - Allow user to type custom response in TiptapMessageInput
    - Send custom text as followup answer
    - Clear input after sending
    - _Requirements: 3.2_

  - [ ] 7.3 Handle option selection responses
    - Maintain existing option click behavior
    - Send selected option as followup answer
    - Support both custom text and option selection
    - _Requirements: 3.3, 3.4_

  - [ ] 7.4 Auto-target session for followup responses
    - Detect which session asked the followup question
    - Automatically set targetSessionId to that session
    - Update SessionSelector to show followup session
    - _Requirements: 3.5_

- [ ] 8. Add error handling and fallbacks
  - [ ] 8.1 Handle Tiptap initialization failures
    - Wrap editor initialization in try-catch
    - Fall back to plain textarea if Tiptap fails
    - Log error and show warning to user
    - _Requirements: 4.1_

  - [ ] 8.2 Validate session targets before sending
    - Check if targetSessionId exists in activeSessions
    - Fall back to main session if invalid
    - Show warning toast for invalid sessions
    - _Requirements: 1.3_

  - [ ] 8.3 Handle interrupt timeout failures
    - Set 3s timeout for each sub-task interrupt
    - Log warning and continue if timeout occurs
    - Still attempt main session interrupt
    - Show toast notification on failures
    - _Requirements: 2.2, 2.3_

- [ ] 9. Replace MessageInput with TiptapMessageInput
  - [ ] 9.1 Update ChatWindow or App component imports
    - Replace MessageInput import with TiptapMessageInput
    - Verify all props are compatible
    - Test basic functionality
    - _Requirements: 4.1, 4.5_

  - [ ] 9.2 Add SessionSelector above input
    - Place SessionSelector component above TiptapMessageInput
    - Wire up session selection state
    - Test session switching
    - _Requirements: 1.5, 5.1_

  - [ ] 9.3 Remove old MessageInput component
    - Delete or rename MessageInput.tsx as backup
    - Clean up unused imports
    - Update any references
    - _Requirements: 4.5_

- [ ]* 10. Testing and polish
  - [ ]* 10.1 Write unit tests for TiptapMessageInput
    - Test editor initialization
    - Test mention trigger and selection
    - Test keyboard shortcuts
    - Test button state transitions

  - [ ]* 10.2 Write unit tests for SessionSelector
    - Test session list rendering
    - Test session switching
    - Test visual state updates

  - [ ]* 10.3 Write integration tests for multi-session flow
    - Test sending message to main session
    - Test sending message to sub-task
    - Test cascade interrupt with multiple sub-tasks
    - Test followup question with custom input

  - [ ]* 10.4 Manual testing and UX refinement
    - Test mention dropdown responsiveness
    - Verify visual feedback clarity
    - Test edge cases (rapid switching, concurrent tasks)
    - Gather user feedback and iterate
