# Implementation Plan

- [x] 1. Set up module structure in packages/server/src/core/
  - [x] 1.1 Create directory structure
    - Create folders: config/, registry/, builder/
    - _Requirements: 6.1_
  - [x] 1.2 Create core entry point and exports
    - Create packages/server/src/core/index.ts with all public exports
    - _Requirements: 6.1, 6.2_

- [x] 2. Implement core types and interfaces
  - [x] 2.1 Reuse existing ToolInterface and ToolParam from @amigo/types
    - No new interfaces needed, use existing types
    - _Requirements: 2.4, 2.5_
  - [x] 2.2 Reuse existing message schemas from @amigo/types
    - Use existing ServerSendMessageSchema structure
    - _Requirements: 3.5_
  - [x] 2.3 Create ServerConfig schema with Zod in packages/server/src/core/config/
    - Define port, storagePath with defaults and validation
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 2.4 Write property test for server config validation
    - **Property 1: Server config application**
    - **Property 2: Invalid config rejection**
    - **Validates: Requirements 1.1, 1.2, 1.4**

- [x] 3. Implement Registry classes in packages/server/src/core/registry/
  - [x] 3.1 Implement ToolRegistry class
    - Methods: register, get, getAll, has, size
    - Duplicate name detection with RegistrationError
    - _Requirements: 2.5_
  - [x] 3.2 Implement MessageRegistry class
    - Methods: register, get, getAll, getAllSchemas, has, size
    - Duplicate type detection with RegistrationError
    - _Requirements: 3.4_
  - [ ]* 3.3 Write property tests for registry operations
    - **Property 5: Duplicate tool rejection**
    - **Property 8: Duplicate message rejection**
    - **Property 13: Registry retrieval correctness**
    - **Validates: Requirements 2.5, 3.4, 6.4**

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement Builder API in packages/server/src/core/builder/
  - [x] 5.1 Implement AmigoServerBuilder class
    - Methods: port(), storagePath(), registerTool(), registerMessage(), build()
    - Chainable API returning this
    - _Requirements: 4.1, 4.2_
  - [-] 5.2 Integrate builder with existing AmigoServer
    - Pass config, toolRegistry, messageRegistry to server
    - _Requirements: 4.2_
  - [ ]* 5.3 Write property tests for builder
    - **Property 9: Builder chaining**
    - **Property 10: Builder produces server**
    - **Property 11: Registry accumulation**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Integrate with existing server
  - [ ] 7.1 Modify AmigoServer to accept configuration from builder
    - Accept toolRegistry and messageRegistry from builder
    - Merge custom tools with BASIC_TOOLS
    - _Requirements: 2.2, 3.2_
  - [ ] 7.2 Modify tool execution to support registry tools
    - Accept tools from registry in ToolExecutor
    - Maintain backward compatibility with existing tools
    - _Requirements: 2.2, 2.3_
  - [ ] 7.3 Modify message handling to support custom messages
    - Merge custom message schemas with existing ServerSendMessageSchema
    - _Requirements: 3.2, 3.3_
  - [ ]* 7.4 Write property tests for tool and message validation
    - **Property 3: Tool parameter validation**
    - **Property 6: Message validation**
    - **Validates: Requirements 2.2, 2.3, 3.2, 3.3**

- [ ] 8. Update exports
  - [ ] 8.1 Update packages/server/src/core/index.ts with all exports
    - Export ServerConfig, registries, builder, errors
    - _Requirements: 6.1, 6.2_
  - [ ]* 8.2 Write integration tests
    - Test complete SDK usage flow
    - _Requirements: 1.1, 1.2, 2.2, 3.2, 4.2_

- [ ] 9. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
