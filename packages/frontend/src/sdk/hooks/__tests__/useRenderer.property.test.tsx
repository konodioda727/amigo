/**
 * useRenderer hook property tests
 *
 * Tests the following correctness properties:
 * - Property 4: Renderer Fallback
 * - Property 10: Renderer Props Completeness
 */

import "../../provider/__tests__/setup";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import * as fc from "fast-check";
import { defaultRenderers } from "../../components/renderers";
import { WebSocketProvider } from "../../provider/WebSocketProvider";
import type { DisplayMessageType, MessageRendererMap } from "../../types";
import { useRenderer } from "../useRenderer";

// ============================================================================
// Test Generators (Arbitraries)
// ============================================================================

/**
 * Generate valid message types
 */
const messageTypeArb = fc.constantFrom(
  "message",
  "tool",
  "userSendMessage",
  "completionResult",
  "askFollowupQuestion",
  "interrupt",
  "error",
  "alert",
  "assignTaskUpdated",
) as fc.Arbitrary<DisplayMessageType["type"]>;

/**
 * Generate partial custom renderer maps
 * Some message types have custom renderers, others don't
 */
const partialRendererMapArb = fc.record(
  {
    message: fc.constant(() => <div>Custom Message</div>),
    error: fc.constant(() => <div>Custom Error</div>),
  },
  { requiredKeys: [] },
) as fc.Arbitrary<Partial<MessageRendererMap>>;

// ============================================================================
// Test Components
// ============================================================================

// Removed unused TestRendererComponent

// ============================================================================
// Property Tests
// ============================================================================

describe("useRenderer Property Tests", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * **Feature: frontend-sdk, Property 4: Renderer Fallback**
   * **Validates: Requirements 4.4, 7.2**
   *
   * For any message type, if no custom renderer is provided,
   * the SDK should use the default renderer for that message type.
   */
  describe("Property 4: Renderer Fallback", () => {
    test("useRenderer should return undefined when no custom renderer is provided", () => {
      fc.assert(
        fc.property(messageTypeArb, (messageType) => {
          let capturedRenderer: any = null;

          function CaptureRenderer() {
            capturedRenderer = useRenderer(messageType);
            return null;
          }

          // Render without custom renderers
          render(
            <WebSocketProvider autoConnect={false}>
              <CaptureRenderer />
            </WebSocketProvider>,
          );

          // Should return undefined (no custom renderer)
          expect(capturedRenderer).toBeUndefined();

          cleanup();
        }),
        { numRuns: 100 },
      );
    });

    test("useRenderer should return custom renderer when provided", () => {
      fc.assert(
        fc.property(partialRendererMapArb, (customRenderers) => {
          const rendererKeys = Object.keys(customRenderers) as DisplayMessageType["type"][];

          if (rendererKeys.length === 0) {
            // Skip if no custom renderers
            return true;
          }

          // Pick the first message type that has a custom renderer
          const messageType = rendererKeys[0];
          let capturedRenderer: any = null;

          function CaptureRenderer() {
            capturedRenderer = useRenderer(messageType);
            return null;
          }

          // Render with custom renderers
          render(
            <WebSocketProvider autoConnect={false} renderers={customRenderers}>
              <CaptureRenderer />
            </WebSocketProvider>,
          );

          // Should return custom renderer
          expect(capturedRenderer).toBeDefined();
          expect(typeof capturedRenderer).toBe("function");

          cleanup();
          return true;
        }),
        { numRuns: 100 },
      );
    });

    test("default renderers should exist for all message types", () => {
      const messageTypes: DisplayMessageType["type"][] = [
        "message",
        "tool",
        "userSendMessage",
        "completionResult",
        "askFollowupQuestion",
        "interrupt",
        "error",
        "alert",
        "assignTaskUpdated",
      ];

      for (const messageType of messageTypes) {
        expect(defaultRenderers[messageType]).toBeDefined();
        expect(typeof defaultRenderers[messageType]).toBe("function");
      }
    });

    test("custom renderers should override defaults for specific types only", () => {
      const customMessageRenderer = () => <div>Custom</div>;
      const customRenderers = {
        message: customMessageRenderer,
      };

      let messageRendererResult: any = null;
      let errorRendererResult: any = null;

      function CaptureRenderers() {
        messageRendererResult = useRenderer("message");
        errorRendererResult = useRenderer("error");
        return null;
      }

      render(
        <WebSocketProvider autoConnect={false} renderers={customRenderers}>
          <CaptureRenderers />
        </WebSocketProvider>,
      );

      // Message should have custom renderer
      expect(messageRendererResult).toBe(customMessageRenderer);

      // Error should not have custom renderer (undefined, will fall back to default)
      expect(errorRendererResult).toBeUndefined();
    });
  });

  /**
   * **Feature: frontend-sdk, Property 10: Renderer Props Completeness**
   * **Validates: Requirements 4.5**
   *
   * For any message renderer, the props passed to the renderer should include
   * the complete message data, taskId, and isLatest flag as specified in MessageRendererProps.
   */
  describe("Property 10: Renderer Props Completeness", () => {
    test("default renderers should accept complete MessageRendererProps", () => {
      // Generate sample messages for each type
      const sampleMessages: Record<string, any> = {
        message: {
          type: "message",
          message: "Test message",
          updateTime: Date.now(),
        },
        userSendMessage: {
          type: "userSendMessage",
          message: "User message",
          updateTime: Date.now(),
          status: "acked",
        },
        error: {
          type: "error",
          message: "Error message",
          updateTime: Date.now(),
        },
        alert: {
          type: "alert",
          data: {
            message: "Alert message",
            severity: "info" as const,
          },
          updateTime: Date.now(),
        },
        interrupt: {
          type: "interrupt",
          updateTime: Date.now(),
        },
        completionResult: {
          type: "completionResult",
          result: "Task completed",
          updateTime: Date.now(),
        },
        askFollowupQuestion: {
          type: "askFollowupQuestion",
          question: "What next?",
          sugestions: ["Option 1", "Option 2"],
          updateTime: Date.now(),
        },
        tool: {
          type: "tool",
          toolName: "browserSearch",
          params: { query: "test" },
          updateTime: Date.now(),
        },
        assignTaskUpdated: {
          type: "assignTaskUpdated",
          index: 0,
          taskId: "task-123",
          updateTime: Date.now(),
        },
      };

      // Test each renderer with complete props
      for (const [messageType, message] of Object.entries(sampleMessages)) {
        const renderer = defaultRenderers[messageType as DisplayMessageType["type"]];
        expect(renderer).toBeDefined();

        // Render with complete props
        // Cast to any to avoid complex type narrowing issues in tests
        const result = render(
          <div>
            {(renderer as any)({
              message,
              taskId: "test-task-id",
              isLatest: true,
            })}
          </div>,
        );

        // Should render without errors
        expect(result.container).toBeDefined();

        cleanup();
      }
    });

    test("renderers should handle isLatest flag correctly", () => {
      fc.assert(
        fc.property(fc.boolean(), (isLatest) => {
          const message = {
            type: "askFollowupQuestion" as const,
            question: "Test question?",
            sugestions: ["Yes", "No"],
            updateTime: Date.now(),
          };

          const renderer = defaultRenderers.askFollowupQuestion;

          // Render with isLatest flag
          const result = render(
            <div>
              {renderer({
                message,
                taskId: "test-task",
                isLatest,
              })}
            </div>,
          );

          // Should render without errors
          expect(result.container).toBeDefined();

          cleanup();
          return true;
        }),
        { numRuns: 100 },
      );
    });

    test("renderers should handle different taskIds", () => {
      fc.assert(
        fc.property(fc.string(), (taskId) => {
          const message = {
            type: "message" as const,
            message: "Test message",
            updateTime: Date.now(),
          };

          const renderer = defaultRenderers.message;

          // Render with random taskId
          const result = render(
            <div>
              {renderer({
                message,
                taskId,
                isLatest: true,
              })}
            </div>,
          );

          // Should render without errors
          expect(result.container).toBeDefined();

          cleanup();
          return true;
        }),
        { numRuns: 100 },
      );
    });
  });
});
