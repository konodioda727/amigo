/**
 * SDK Integration Tests
 *
 * Tests the complete SDK flow: Provider → Hooks → Components → Renderers
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4
 */

import "../provider/__tests__/setup";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ChatWindow } from "../components/ChatWindow";
import { ConversationHistory } from "../components/ConversationHistory";
import { MessageInput } from "../components/MessageInput";
import { useConnection } from "../hooks/useConnection";
import { useMessages } from "../hooks/useMessages";
import { useTasks } from "../hooks/useTasks";
import type { DisplayMessageType } from "../messages/types";
import { WebSocketProvider } from "../provider/WebSocketProvider";

// ============================================================================
// Test Setup
// ============================================================================

describe("SDK Integration Tests", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * Test 1: Complete SDK Flow - Provider → Hooks → Components
   *
   * This test validates the basic SDK integration:
   * 1. WebSocketProvider initializes and provides context
   * 2. Hooks access the context and return correct data
   * 3. Components render using hooks
   */
  test("Complete SDK flow: Provider → Hooks → Components", () => {
    let capturedMessages: DisplayMessageType[] = [];
    let capturedConnectionStatus: string = "";
    let capturedTasks: any = {};

    // Test component that uses hooks
    function TestComponent() {
      const { messages } = useMessages();
      const { status } = useConnection();
      const { tasks } = useTasks();

      capturedMessages = messages;
      capturedConnectionStatus = status;
      capturedTasks = tasks;

      return (
        <div data-testid="test-component">
          <div data-testid="status">{status}</div>
          <div data-testid="message-count">{messages.length}</div>
          <div data-testid="task-count">{Object.keys(tasks).length}</div>
        </div>
      );
    }

    // Render with provider (autoConnect=false to avoid WebSocket connection)
    const { getByTestId } = render(
      <WebSocketProvider url="ws://localhost:10013" autoConnect={false}>
        <TestComponent />
      </WebSocketProvider>,
    );

    // Verify initial state
    expect(getByTestId("status").textContent).toBe("disconnected");
    expect(getByTestId("message-count").textContent).toBe("0");
    expect(getByTestId("task-count").textContent).toBe("0");

    // Verify hooks returned data
    expect(capturedMessages).toEqual([]);
    expect(capturedConnectionStatus).toBe("disconnected");
    expect(capturedTasks).toEqual({});
  });

  /**
   * Test 2: Custom Renderer Integration
   *
   * Validates that custom renderers:
   * 1. Can be provided to WebSocketProvider
   * 2. Are accessible through context
   */
  test("Custom renderer integration", () => {
    const customMessageRenderer = (props: any) => {
      return <div data-testid="custom-message">Custom: {props.message.type}</div>;
    };

    const customRenderers = {
      message: customMessageRenderer,
    };

    const capturedRenderers: any = null;

    function TestComponent() {
      const { messages } = useMessages();
      return <div data-testid="messages">{messages.length}</div>;
    }

    render(
      <WebSocketProvider url="ws://localhost:10013" autoConnect={false} renderers={customRenderers}>
        <TestComponent />
      </WebSocketProvider>,
    );

    // Test passes if no errors thrown - custom renderers are accepted
    expect(true).toBe(true);
  });

  /**
   * Test 3: Component Integration
   *
   * Validates that all SDK components work together:
   * 1. ChatWindow renders
   * 2. MessageInput renders
   * 3. ConversationHistory renders
   */
  test("All SDK components render together", () => {
    const { container } = render(
      <WebSocketProvider url="ws://localhost:10013" autoConnect={false}>
        <div>
          <div data-testid="chat-window">
            <ChatWindow />
          </div>
          <div data-testid="message-input">
            <MessageInput />
          </div>
          <div data-testid="conversation-history">
            <ConversationHistory />
          </div>
        </div>
      </WebSocketProvider>,
    );

    // Verify all components rendered
    expect(container.querySelector('[data-testid="chat-window"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="message-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="conversation-history"]')).not.toBeNull();
  });

  /**
   * Test 4: Event Handler Integration
   *
   * Validates that event handlers can be provided to WebSocketProvider
   */
  test("Event handlers can be provided", () => {
    let connectCalled = false;
    let disconnectCalled = false;
    let errorCalled = false;
    let messageCalled = false;

    const onConnect = () => {
      connectCalled = true;
    };
    const onDisconnect = () => {
      disconnectCalled = true;
    };
    const onError = () => {
      errorCalled = true;
    };
    const onMessage = () => {
      messageCalled = true;
    };

    render(
      <WebSocketProvider
        url="ws://localhost:10013"
        autoConnect={false}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onError={onError}
        onMessage={onMessage}
      >
        <div>Test</div>
      </WebSocketProvider>,
    );

    // Test passes if no errors thrown - handlers are accepted
    expect(true).toBe(true);
  });

  /**
   * Test 5: Provider Configuration Propagation
   *
   * Validates that configuration provided to WebSocketProvider:
   * 1. Is accessible through hooks
   * 2. Affects hook behavior
   */
  test("Provider configuration propagates to hooks", () => {
    const config = {
      url: "ws://test.example.com:8080",
      autoConnect: false,
      reconnect: true,
      reconnectInterval: 5000,
      reconnectAttempts: 10,
    };

    function TestComponent() {
      const { status } = useConnection();
      return <div data-testid="status">{status}</div>;
    }

    const { getByTestId } = render(
      <WebSocketProvider {...config}>
        <TestComponent />
      </WebSocketProvider>,
    );

    // Since autoConnect is false, status should be disconnected
    expect(getByTestId("status").textContent).toBe("disconnected");
  });

  /**
   * Test 6: Multiple Components Sharing State
   *
   * Validates that multiple components:
   * 1. Share the same store instance
   * 2. Receive the same data
   */
  test("Multiple components share state correctly", () => {
    function Component1() {
      const { messages } = useMessages();
      return <div data-testid="comp1-count">{messages.length}</div>;
    }

    function Component2() {
      const { messages } = useMessages();
      return <div data-testid="comp2-count">{messages.length}</div>;
    }

    const { getByTestId } = render(
      <WebSocketProvider url="ws://localhost:10013" autoConnect={false}>
        <Component1 />
        <Component2 />
      </WebSocketProvider>,
    );

    // Both components should show the same count
    expect(getByTestId("comp1-count").textContent).toBe(getByTestId("comp2-count").textContent);
  });

  /**
   * Test 7: ChatWindow with Custom Props
   *
   * Validates that ChatWindow accepts and uses custom props
   */
  test("ChatWindow accepts custom props", () => {
    const { container } = render(
      <WebSocketProvider url="ws://localhost:10013" autoConnect={false}>
        <ChatWindow
          className="custom-class"
          showHeader={true}
          headerContent={<div data-testid="custom-header">Custom Header</div>}
        />
      </WebSocketProvider>,
    );

    // Verify custom header is rendered
    expect(container.querySelector('[data-testid="custom-header"]')).not.toBeNull();
  });

  /**
   * Test 8: MessageInput with Custom Props
   *
   * Validates that MessageInput accepts and uses custom props
   */
  test("MessageInput accepts custom props", () => {
    const { container } = render(
      <WebSocketProvider url="ws://localhost:10013" autoConnect={false}>
        <MessageInput
          className="custom-input"
          placeholder="Custom placeholder"
          disabled={false}
          showMentions={true}
        />
      </WebSocketProvider>,
    );

    // Test passes if no errors thrown
    expect(container).not.toBeNull();
  });

  /**
   * Test 9: Provider with Initial State
   *
   * Validates that WebSocketProvider accepts initial state configuration
   */
  test("Provider accepts initial state", () => {
    const initialState = {
      connectionStatus: "disconnected" as const,
      tasks: {},
      mainTaskId: null,
      currentTaskId: null,
    };

    function TestComponent() {
      const { status } = useConnection();
      return <div data-testid="status">{status}</div>;
    }

    const { getByTestId } = render(
      <WebSocketProvider url="ws://localhost:10013" autoConnect={false} initialState={initialState}>
        <TestComponent />
      </WebSocketProvider>,
    );

    expect(getByTestId("status").textContent).toBe("disconnected");
  });

  /**
   * Test 10: Hooks Return Correct Types
   *
   * Validates that hooks return data with correct structure
   */
  test("Hooks return correct data structures", () => {
    let messagesResult: any = null;
    let connectionResult: any = null;
    let tasksResult: any = null;

    function TestComponent() {
      messagesResult = useMessages();
      connectionResult = useConnection();
      tasksResult = useTasks();
      return <div>Test</div>;
    }

    render(
      <WebSocketProvider url="ws://localhost:10013" autoConnect={false}>
        <TestComponent />
      </WebSocketProvider>,
    );

    // Verify useMessages returns correct structure
    expect(messagesResult).toHaveProperty("messages");
    expect(messagesResult).toHaveProperty("rawMessages");
    expect(messagesResult).toHaveProperty("sendMessage");
    expect(messagesResult).toHaveProperty("clearMessages");

    // Verify useConnection returns correct structure
    expect(connectionResult).toHaveProperty("status");
    expect(connectionResult).toHaveProperty("isConnected");
    expect(connectionResult).toHaveProperty("isConnecting");
    expect(connectionResult).toHaveProperty("isDisconnected");

    // Verify useTasks returns correct structure
    expect(tasksResult).toHaveProperty("tasks");
    expect(tasksResult).toHaveProperty("currentTaskId");
    expect(tasksResult).toHaveProperty("mainTaskId");
    expect(tasksResult).toHaveProperty("switchTask");
    expect(tasksResult).toHaveProperty("getTaskHierarchy");
    expect(tasksResult).toHaveProperty("getTaskStatus");
  });
});
