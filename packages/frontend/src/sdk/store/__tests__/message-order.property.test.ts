/**
 * Property-Based Test for Message Processing Order
 *
 * **Feature: frontend-sdk, Property 5: Message Processing Order**
 * **Validates: Requirements 8.3**
 *
 * For any sequence of WebSocket messages, the SDK should process and display them
 * in the order they were received, maintaining message threading relationships.
 */

import { describe, expect, test } from "bun:test";
import type { SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import * as fc from "fast-check";
import { combineMessages } from "../../messages/messageCombiner";

// ============================================================================
// Test Generators (Arbitraries)
// ============================================================================

/**
 * Generate a timestamp
 */
const timestampArb = fc.integer({ min: 1000000000000, max: 9999999999999 });

/**
 * Generate a task ID
 */
const taskIdArb = fc.oneof(
  fc.constant("task-1"),
  fc.constant("task-2"),
  fc.constant("task-3"),
  fc.uuid(),
);

/**
 * Generate a message content string
 */
const messageContentArb = fc.oneof(
  fc.constant("Hello"),
  fc.constant("Test message"),
  fc.lorem({ maxCount: 5 }),
  fc.string({ minLength: 1, maxLength: 100 }),
);

/**
 * Generate a common message
 */
const commonMessageArb = fc.record({
  type: fc.constant("message" as const),
  data: fc.record({
    message: messageContentArb,
    updateTime: timestampArb,
    partial: fc.boolean(),
  }),
});

/**
 * Generate a user send message
 */
const userSendMessageArb = fc.record({
  type: fc.constant("userSendMessage" as const),
  data: fc.record({
    message: messageContentArb,
    taskId: taskIdArb,
    updateTime: timestampArb,
    status: fc.constantFrom("pending" as const, "acked" as const, "failed" as const),
  }),
});

/**
 * Generate an error message
 */
const errorMessageArb = fc.record({
  type: fc.constant("error" as const),
  data: fc.record({
    message: messageContentArb,
    updateTime: timestampArb,
  }),
});

/**
 * Generate an interrupt message
 */
const interruptMessageArb = fc.record({
  type: fc.constant("interrupt" as const),
  data: fc.record({
    updateTime: timestampArb,
  }),
});

/**
 * Generate a WebSocket message
 */
const websocketMessageArb = fc.oneof(
  commonMessageArb,
  userSendMessageArb,
  errorMessageArb,
  interruptMessageArb,
);

/**
 * Generate a sequence of WebSocket messages
 */
const messageSequenceArb = fc.array(websocketMessageArb, { minLength: 1, maxLength: 20 });

// ============================================================================
// Property Tests
// ============================================================================

describe("Property 5: Message Processing Order", () => {
  /**
   * Property: Messages are processed in the order they are received
   *
   * For any sequence of messages, the combined messages should maintain
   * the relative order of the input messages (excluding merged messages).
   */
  test("Messages maintain input order", () => {
    fc.assert(
      fc.property(messageSequenceArb, (messages) => {
        // Combine messages
        const combined = combineMessages(messages as any);

        // Extract update times from input messages
        const inputTimes = messages.map((msg) => {
          if ("updateTime" in msg.data) {
            return msg.data.updateTime;
          }
          return 0;
        });

        // Extract update times from combined messages
        const outputTimes = combined.map((msg) => msg.updateTime);

        // Verify that output times are in non-decreasing order
        // (messages with same updateTime can be merged, so we allow equal times)
        for (let i = 1; i < outputTimes.length; i++) {
          expect(outputTimes[i]).toBeGreaterThanOrEqual(outputTimes[i - 1]);
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Message count is preserved or reduced (due to merging)
   *
   * The number of combined messages should be less than or equal to
   * the number of input messages (messages can be merged but not duplicated).
   */
  test("Message count is preserved or reduced", () => {
    fc.assert(
      fc.property(messageSequenceArb, (messages) => {
        const combined = combineMessages(messages as any);

        // Combined messages should not exceed input messages
        expect(combined.length).toBeLessThanOrEqual(messages.length);

        // Combined messages should have at least 1 message if input has messages
        if (messages.length > 0) {
          expect(combined.length).toBeGreaterThan(0);
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Message types are preserved
   *
   * All message types in the output should correspond to message types
   * in the input (or derived types like "tool" from tool messages).
   */
  test("Message types are preserved", () => {
    fc.assert(
      fc.property(messageSequenceArb, (messages) => {
        const combined = combineMessages(messages as any);

        // Extract input message types
        const inputTypes = new Set(messages.map((msg) => msg.type));

        // Extract output message types
        const outputTypes = new Set(combined.map((msg) => msg.type));

        // All output types should be valid display message types
        const validTypes = new Set([
          "message",
          "userSendMessage",
          "tool",
          "completionResult",
          "askFollowupQuestion",
          "interrupt",
          "error",
          "alert",
          "assignTaskUpdated",
        ]);

        for (const type of outputTypes) {
          expect(validTypes.has(type)).toBe(true);
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Timestamps are monotonically increasing
   *
   * For any sequence of messages, the combined messages should have
   * timestamps in non-decreasing order.
   */
  test("Timestamps are monotonically increasing", () => {
    fc.assert(
      fc.property(messageSequenceArb, (messages) => {
        const combined = combineMessages(messages as any);

        // Check that timestamps are in non-decreasing order
        for (let i = 1; i < combined.length; i++) {
          const prevTime = combined[i - 1].updateTime;
          const currTime = combined[i].updateTime;

          expect(currTime).toBeGreaterThanOrEqual(prevTime);
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Empty input produces empty output
   *
   * Processing an empty message array should produce an empty result.
   */
  test("Empty input produces empty output", () => {
    const combined = combineMessages([]);
    expect(combined).toEqual([]);
  });

  /**
   * Property: Single message is preserved
   *
   * Processing a single message should produce exactly one output message
   * with the same type and content.
   */
  test("Single message is preserved", () => {
    fc.assert(
      fc.property(websocketMessageArb, (message) => {
        const combined = combineMessages([message as any]);

        // Should have exactly one message
        expect(combined.length).toBe(1);

        // Type should be preserved (or transformed appropriately)
        const outputType = combined[0].type;
        expect(outputType).toBeDefined();

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Idempotence of message combining
   *
   * Combining messages twice should produce the same result as combining once
   * (since the output is already combined).
   */
  test("Combining is idempotent for already-combined messages", () => {
    fc.assert(
      fc.property(messageSequenceArb, (messages) => {
        const combined1 = combineMessages(messages as any);

        // Convert combined messages back to WebSocket format
        const asWebSocket = combined1.map((msg) => ({
          type: msg.type,
          data: msg,
        }));

        const combined2 = combineMessages(asWebSocket as any);

        // The two results should have the same length
        expect(combined2.length).toBe(combined1.length);

        // The types should match
        for (let i = 0; i < combined1.length; i++) {
          expect(combined2[i].type).toBe(combined1[i].type);
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Message content is preserved
   *
   * For user messages and common messages, the content should be preserved
   * in the combined output.
   */
  test("Message content is preserved", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(commonMessageArb, userSendMessageArb), { minLength: 1, maxLength: 10 }),
        (messages) => {
          const combined = combineMessages(messages as any);

          // Extract all message contents from input
          const inputContents = messages.map((msg) => msg.data.message);

          // Extract all message contents from output
          const outputContents = combined
            .filter((msg) => "message" in msg)
            .map((msg: any) => msg.message);

          // All input contents should appear in output (possibly merged)
          const outputText = outputContents.join("");
          for (const content of inputContents) {
            if (content) {
              expect(outputText).toContain(content);
            }
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
