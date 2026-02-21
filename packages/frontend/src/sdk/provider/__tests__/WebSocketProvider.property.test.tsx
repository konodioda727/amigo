/**
 * WebSocketProvider property tests
 *
 * Tests the following correctness properties:
 * - Property 1: Provider Initialization
 */

import "./setup";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import * as fc from "fast-check";
import { useWebSocketContext } from "../../context/WebSocketContext";
import { WebSocketProvider } from "../WebSocketProvider";

// ============================================================================
// Test Generators (Arbitraries)
// ============================================================================

/**
 * Generate valid WebSocket URLs
 */
const wsUrlArb = fc.oneof(
  fc.constant("ws://localhost:10013"),
  fc.constant("ws://localhost:8080"),
  fc.constant("ws://127.0.0.1:3000"),
  fc.webUrl({ validSchemes: ["ws", "wss"] }),
);

/**
 * Generate boolean values for autoConnect
 */
const autoConnectArb = fc.boolean();

/**
 * Generate boolean values for reconnect
 */
const reconnectArb = fc.boolean();

/**
 * Generate reconnect intervals (in milliseconds)
 */
const reconnectIntervalArb = fc.integer({ min: 1000, max: 10000 });

/**
 * Generate reconnect attempts
 */
const reconnectAttemptsArb = fc.integer({ min: 1, max: 10 });

/**
 * Generate complete provider configuration
 */
const providerConfigArb = fc.record({
  url: wsUrlArb,
  autoConnect: autoConnectArb,
  reconnect: reconnectArb,
  reconnectInterval: reconnectIntervalArb,
  reconnectAttempts: reconnectAttemptsArb,
});

// ============================================================================
// Test Component
// ============================================================================

/**
 * Test component that accesses the WebSocket context
 */
function TestComponent() {
  const context = useWebSocketContext();

  return (
    <div data-testid="test-component">
      <div data-testid="url">{context.config.url}</div>
      <div data-testid="autoConnect">{String(context.config.autoConnect)}</div>
      <div data-testid="reconnect">{String(context.config.reconnect)}</div>
      <div data-testid="reconnectInterval">{context.config.reconnectInterval}</div>
      <div data-testid="reconnectAttempts">{context.config.reconnectAttempts}</div>
      <div data-testid="hasStore">{String(!!context.store)}</div>
    </div>
  );
}

// ============================================================================
// Property Tests
// ============================================================================

describe("WebSocketProvider Property Tests", () => {
  beforeEach(() => {
    // Clean up any existing WebSocket connections
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * **Feature: frontend-sdk, Property 1: Provider Initialization**
   * **Validates: Requirements 2.2, 2.3**
   *
   * For any WebSocketProvider configuration, when the provider mounts,
   * it should initialize the Zustand store and establish a WebSocket
   * connection if autoConnect is true.
   */
  describe("Property 1: Provider Initialization", () => {
    test("Provider should initialize store with any valid configuration", () => {
      fc.assert(
        fc.property(providerConfigArb, (config) => {
          // Disable autoConnect for testing to avoid actual WebSocket connections
          const testConfig = { ...config, autoConnect: false };

          // Render provider with configuration
          const { getByTestId } = render(
            <WebSocketProvider
              url={testConfig.url}
              autoConnect={testConfig.autoConnect}
              reconnect={testConfig.reconnect}
              reconnectInterval={testConfig.reconnectInterval}
              reconnectAttempts={testConfig.reconnectAttempts}
            >
              <TestComponent />
            </WebSocketProvider>,
          );

          // Verify configuration is passed correctly
          expect(getByTestId("url").textContent).toBe(testConfig.url);
          expect(getByTestId("autoConnect").textContent).toBe(String(testConfig.autoConnect));
          expect(getByTestId("reconnect").textContent).toBe(String(testConfig.reconnect));
          expect(getByTestId("reconnectInterval").textContent).toBe(
            String(testConfig.reconnectInterval),
          );
          expect(getByTestId("reconnectAttempts").textContent).toBe(
            String(testConfig.reconnectAttempts),
          );

          // Verify store is initialized
          expect(getByTestId("hasStore").textContent).toBe("true");

          // Clean up
          cleanup();
        }),
        { numRuns: 100 },
      );
    });

    test("Provider should initialize with default values when props are omitted", () => {
      const { getByTestId } = render(
        <WebSocketProvider autoConnect={false}>
          <TestComponent />
        </WebSocketProvider>,
      );

      // Verify default values
      expect(getByTestId("url").textContent).toBe("ws://localhost:10013");
      expect(getByTestId("autoConnect").textContent).toBe("false");
      expect(getByTestId("reconnect").textContent).toBe("true");
      expect(getByTestId("reconnectInterval").textContent).toBe("3000");
      expect(getByTestId("reconnectAttempts").textContent).toBe("5");
      expect(getByTestId("hasStore").textContent).toBe("true");
    });

    test("Provider should pass custom renderers to context", () => {
      const customRenderers = {
        message: () => <div>Custom Message</div>,
      };

      let capturedContext: any = null;

      function CaptureContext() {
        capturedContext = useWebSocketContext();
        return null;
      }

      render(
        <WebSocketProvider autoConnect={false} renderers={customRenderers}>
          <CaptureContext />
        </WebSocketProvider>,
      );

      expect(capturedContext).not.toBeNull();
      expect(capturedContext.renderers).toBe(customRenderers);
    });

    test("Provider should pass event handlers to context", () => {
      const handlers = {
        onConnect: () => {},
        onDisconnect: () => {},
        onError: () => {},
        onMessage: () => {},
      };

      let capturedContext: any = null;

      function CaptureContext() {
        capturedContext = useWebSocketContext();
        return null;
      }

      render(
        <WebSocketProvider
          autoConnect={false}
          onConnect={handlers.onConnect}
          onDisconnect={handlers.onDisconnect}
          onError={handlers.onError}
          onMessage={handlers.onMessage}
        >
          <CaptureContext />
        </WebSocketProvider>,
      );

      expect(capturedContext).not.toBeNull();
      expect(capturedContext.handlers.onConnect).toBe(handlers.onConnect);
      expect(capturedContext.handlers.onDisconnect).toBe(handlers.onDisconnect);
      expect(capturedContext.handlers.onError).toBe(handlers.onError);
      expect(capturedContext.handlers.onMessage).toBe(handlers.onMessage);
    });
  });
});
