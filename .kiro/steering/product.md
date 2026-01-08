# Product Overview

Amigo is a WebSocket-based AI agent orchestration system designed for complex workflows through hierarchical task delegation and multi-agent collaboration.

## Core Capabilities

- **Real-time Streaming Communication**: WebSocket-driven bidirectional communication with streaming LLM responses
- **Hierarchical Task Management**: Parent-child task tree structure enabling parallel execution and clear dependency tracking
- **Multi-Agent Collaboration**: Main agent coordinates while dynamically spawned sub-agents handle specialized tasks
- **Tool-Based Extensibility**: Pluggable tool system for custom capabilities (search, code execution, API calls)
- **Persistent Context**: File-based conversation history and task state with session recovery support
- **Interrupt & Resume**: Task-level pause/continue allowing user intervention and guidance

## Architecture Pattern

The system follows a client-server model where:
- **Frontend**: React-based chat interface with real-time message rendering
- **Backend**: Bun-powered WebSocket server orchestrating LLM interactions, tool execution, and state persistence
- **Message Flow**: User input → WebSocket → Message resolver → Conversation manager → LLM stream → XML parser → Tool execution → Result emission → Frontend rendering → Storage persistence

## Key Design Decisions

- **WebSocket over HTTP**: Enables millisecond-latency bidirectional communication and natural session state management
- **XML for Tool Calls**: Stream-friendly format with high fault tolerance and LLM generation accuracy
- **Task Delegation Model**: Complex tasks automatically decomposed into manageable subtasks assigned to specialized sub-agents
- **File-Based Storage**: Zero-configuration persistence supporting conversation recovery and audit trails
