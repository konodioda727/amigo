# Frontend Routing

## Overview

The frontend now uses React Router for navigation, allowing users to bookmark and share specific conversations via URL.

## Routes

- `/` - Home page with default chat view
- `/:taskId` - Conversation page for specific task

## Implementation

### Pages

**HomePage** (`src/pages/HomePage.tsx`)
- Default landing page
- Displays ChatWindow and MessageInput without specific taskId
- Used for new conversations

**ChatPage** (`src/pages/ChatPage.tsx`)
- Task-specific conversation view
- Extracts taskId from URL params
- Automatically loads conversation history via `sendLoadTask`
- Syncs URL taskId with Zustand store's mainTaskId

### Navigation Components

**ConversationHistory** (`src/components/ConversationHistory.tsx`)
- Wraps SDK ConversationHistory component
- Uses `useNavigate()` to navigate to `/:taskId` on conversation selection
- Passes current URL taskId to SDK component for highlighting
- Auto-closes sidebar on mobile after selection

**NewChatButton** (`src/components/NewChatButton.tsx`)
- Creates new conversation via store action
- Navigates to `/` for fresh chat
- Closes sidebar after action

### SDK Updates

**ConversationHistory** (`src/sdk/components/ConversationHistory.tsx`)
- Added `activeTaskId` prop for external control of highlighting
- Falls back to `mainTaskId` from store if not provided
- Allows app layer to control active state via URL

## Usage

```tsx
// Navigate to specific conversation
navigate(`/${taskId}`);

// Navigate to home for new conversation
navigate('/');

// Get current taskId from URL
const { taskId } = useParams<{ taskId: string }>();
```

## State Flow

1. User clicks conversation in sidebar
2. App navigates to `/:taskId`
3. ChatPage component mounts/updates
4. ChatPage calls `sendLoadTask(taskId)`
5. Server sends conversation history
6. Messages display in ChatWindow
7. URL reflects current conversation

## Benefits

- **Bookmarkable**: Users can save and return to specific conversations
- **Shareable**: URLs can be shared with others (if auth permits)
- **Browser Navigation**: Back/forward buttons work as expected
- **Deep Linking**: Direct access to conversations via URL
