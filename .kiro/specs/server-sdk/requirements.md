# Requirements Document

## Introduction

本文档定义了将 Amigo 服务端打包为可扩展 SDK 的需求。SDK 允许用户自定义服务器配置（端口、存储路径）、注册自定义工具（Tools）和自定义消息类型，同时保持类型安全和运行时验证。核心设计目标是在保证类型约束的同时提供最大的灵活性和扩展性。

## Glossary

- **SDK**: Software Development Kit，软件开发工具包，本项目中指封装后的服务端库
- **Tool**: 工具，LLM 可调用的功能单元，包含名称、参数定义、执行逻辑
- **Message**: 消息，WebSocket 通信中的数据单元，包含类型和数据负载
- **Zod Schema**: 使用 Zod 库定义的运行时类型验证模式
- **Registry**: 注册表，用于动态注册和管理自定义组件的机制
- **Type Inference**: 类型推断，从 Zod Schema 自动推导 TypeScript 类型

## Requirements

### Requirement 1

**User Story:** As an SDK user, I want to configure server settings through a simple API, so that I can customize the server behavior without modifying source code.

#### Acceptance Criteria

1. WHEN an SDK user creates a server instance with port configuration THEN the SDK SHALL start the WebSocket server on the specified port
2. WHEN an SDK user provides a storage path configuration THEN the SDK SHALL persist all conversation data to the specified directory
3. WHEN an SDK user omits optional configuration THEN the SDK SHALL use sensible default values (port: 10013, storage: ./storage)
4. WHEN an SDK user provides invalid configuration values THEN the SDK SHALL throw a descriptive error before server startup

### Requirement 2

**User Story:** As an SDK user, I want to define custom tools with type-safe schemas, so that I can extend the agent's capabilities while maintaining type safety.

#### Acceptance Criteria

1. WHEN an SDK user defines a tool using Zod schema THEN the SDK SHALL infer TypeScript types for parameters and return values automatically
2. WHEN an SDK user registers a custom tool THEN the SDK SHALL validate tool parameters at runtime using the provided Zod schema
3. WHEN an SDK user's tool receives invalid parameters THEN the SDK SHALL reject the invocation with a clear validation error message
4. WHEN an SDK user defines a tool THEN the SDK SHALL require name, description, whenToUse, params schema, and invoke function
5. WHEN an SDK user registers a tool with a duplicate name THEN the SDK SHALL throw an error indicating the conflict

### Requirement 3

**User Story:** As an SDK user, I want to define custom message types with type-safe schemas, so that I can extend the communication protocol while maintaining type safety.

#### Acceptance Criteria

1. WHEN an SDK user defines a message type using Zod schema THEN the SDK SHALL infer TypeScript types for message data automatically
2. WHEN an SDK user registers a custom message type THEN the SDK SHALL include the message type in the server's message handling
3. WHEN the server receives a custom message THEN the SDK SHALL validate the message data using the provided Zod schema
4. WHEN an SDK user registers a message type with a duplicate name THEN the SDK SHALL throw an error indicating the conflict
5. WHEN an SDK user defines a message type THEN the SDK SHALL require type name and data schema

### Requirement 4

**User Story:** As an SDK user, I want a fluent builder API for server configuration, so that I can compose server settings in a readable and chainable manner.

#### Acceptance Criteria

1. WHEN an SDK user uses the builder pattern THEN the SDK SHALL allow chaining configuration methods
2. WHEN an SDK user calls the build method THEN the SDK SHALL return a configured server instance
3. WHEN an SDK user registers multiple tools via builder THEN the SDK SHALL accumulate all tools in the final configuration
4. WHEN an SDK user registers multiple message types via builder THEN the SDK SHALL accumulate all message types in the final configuration

### Requirement 5

**User Story:** As an SDK user, I want helper functions to create tools and messages, so that I can define extensions with minimal boilerplate while maintaining type safety.

#### Acceptance Criteria

1. WHEN an SDK user uses the defineTool helper THEN the SDK SHALL provide full TypeScript inference for the tool definition
2. WHEN an SDK user uses the defineMessage helper THEN the SDK SHALL provide full TypeScript inference for the message definition
3. WHEN an SDK user uses helper functions THEN the SDK SHALL validate the definition structure at compile time
4. WHEN an SDK user serializes a tool definition THEN the SDK SHALL produce a valid JSON representation for the tool schema (for pretty printing)
5. WHEN an SDK user parses a tool definition from JSON THEN the SDK SHALL reconstruct the tool with proper type information (for round-trip validation)

### Requirement 6

**User Story:** As an SDK user, I want the SDK to export all necessary types, so that I can use them in my application code with full IDE support.

#### Acceptance Criteria

1. WHEN an SDK user imports from the SDK THEN the SDK SHALL export all public types and interfaces
2. WHEN an SDK user uses exported types THEN the SDK SHALL provide accurate type definitions for IDE autocompletion
3. WHEN an SDK user extends SDK types THEN the SDK SHALL allow type augmentation through declaration merging
4. WHEN an SDK user accesses tool or message registries THEN the SDK SHALL provide type-safe access to registered components
