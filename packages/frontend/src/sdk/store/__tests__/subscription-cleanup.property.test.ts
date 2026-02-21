/**
 * Property-Based Test for Message Subscription Cleanup
 *
 * **Feature: frontend-sdk, Property 8: Message Subscription Cleanup**
 * **Validates: Requirements 2.7**
 *
 * For any message subscription created via subscribe(), calling the returned
 * unsubscribe function should remove the listener and prevent future notifications.
 */

import { describe, expect, test } from "bun:test";
import type { SERVER_SEND_MESSAGE_NAME } from "@amigo-llm/types";
import * as fc from "fast-check";
import { createWebSocketStore } from "../createWebSocketStore";

// ============================================================================
// Test Generators (Arbitraries)
// ============================================================================

/**
 * Generate a message type
 */
const messageTypeArb = fc.constantFrom<SERVER_SEND_MESSAGE_NAME>(
  "message",
  "tool",
  "completionResult",
  "error",
  "interrupt",
  "ack",
  "connected",
);

/**
 * Generate a number of subscribers
 */
const subscriberCountArb = fc.integer({ min: 1, max: 10 });

/**
 * Generate a number of messages to send
 */
const messageCountArb = fc.integer({ min: 1, max: 20 });

// ============================================================================
// Property Tests
// ============================================================================

describe("Property 8: Message Subscription Cleanup", () => {
  /**
   * Property: Unsubscribe prevents future notifications
   *
   * For any subscription, calling unsubscribe should prevent the listener
   * from receiving future notifications.
   */
  test("Unsubscribe prevents future notifications", () => {
    fc.assert(
      fc.property(messageTypeArb, messageCountArb, (messageType, messageCount) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        let notificationCount = 0;

        // Subscribe to a message type
        const unsubscribe = store.getState().subscribe(messageType, () => {
          notificationCount++;
        });

        // Send some messages before unsubscribing
        for (let i = 0; i < Math.floor(messageCount / 2); i++) {
          store.getState().notifyListeners({
            type: messageType,
            data: { message: `Test ${i}` },
          } as any);
        }

        const countBeforeUnsubscribe = notificationCount;

        // Unsubscribe
        unsubscribe();

        // Send more messages after unsubscribing
        for (let i = 0; i < Math.ceil(messageCount / 2); i++) {
          store.getState().notifyListeners({
            type: messageType,
            data: { message: `Test ${i}` },
          } as any);
        }

        // Count should not have increased after unsubscribe
        expect(notificationCount).toBe(countBeforeUnsubscribe);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Multiple unsubscribes are safe
   *
   * Calling unsubscribe multiple times should not cause errors.
   */
  test("Multiple unsubscribes are safe", () => {
    fc.assert(
      fc.property(messageTypeArb, (messageType) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        let notificationCount = 0;

        const unsubscribe = store.getState().subscribe(messageType, () => {
          notificationCount++;
        });

        // Unsubscribe multiple times
        unsubscribe();
        unsubscribe();
        unsubscribe();

        // Send a message
        store.getState().notifyListeners({
          type: messageType,
          data: { message: "Test" },
        } as any);

        // Should not have received any notifications
        expect(notificationCount).toBe(0);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Each subscription has independent cleanup
   *
   * Unsubscribing one listener should not affect other listeners.
   */
  test("Each subscription has independent cleanup", () => {
    fc.assert(
      fc.property(messageTypeArb, subscriberCountArb, (messageType, subscriberCount) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        const notificationCounts: number[] = [];
        const unsubscribers: (() => void)[] = [];

        // Create multiple subscribers
        for (let i = 0; i < subscriberCount; i++) {
          notificationCounts.push(0);
          const index = i;
          const unsubscribe = store.getState().subscribe(messageType, () => {
            notificationCounts[index]++;
          });
          unsubscribers.push(unsubscribe);
        }

        // Unsubscribe the first one
        if (unsubscribers.length > 0) {
          unsubscribers[0]();
        }

        // Send a message
        store.getState().notifyListeners({
          type: messageType,
          data: { message: "Test" },
        } as any);

        // First subscriber should not have been notified
        expect(notificationCounts[0]).toBe(0);

        // All other subscribers should have been notified
        for (let i = 1; i < subscriberCount; i++) {
          expect(notificationCounts[i]).toBe(1);
        }

        // Clean up remaining subscribers
        for (let i = 1; i < unsubscribers.length; i++) {
          unsubscribers[i]();
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Unsubscribe is idempotent
   *
   * Calling unsubscribe multiple times should have the same effect as calling it once.
   */
  test("Unsubscribe is idempotent", () => {
    fc.assert(
      fc.property(
        messageTypeArb,
        fc.integer({ min: 1, max: 5 }),
        (messageType, unsubscribeCount) => {
          const store = createWebSocketStore({
            url: "ws://localhost:10013",
            autoConnect: false,
          });

          let notificationCount = 0;

          const unsubscribe = store.getState().subscribe(messageType, () => {
            notificationCount++;
          });

          // Unsubscribe multiple times
          for (let i = 0; i < unsubscribeCount; i++) {
            unsubscribe();
          }

          // Send a message
          store.getState().notifyListeners({
            type: messageType,
            data: { message: "Test" },
          } as any);

          // Should not have received any notifications
          expect(notificationCount).toBe(0);

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Subscriptions are isolated by message type
   *
   * Subscribing to one message type should not receive notifications for other types.
   */
  test("Subscriptions are isolated by message type", () => {
    fc.assert(
      fc.property(messageTypeArb, messageTypeArb, (type1, type2) => {
        // Skip if types are the same
        if (type1 === type2) return true;

        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        let count1 = 0;
        let count2 = 0;

        // Subscribe to both types
        const unsubscribe1 = store.getState().subscribe(type1, () => {
          count1++;
        });
        const unsubscribe2 = store.getState().subscribe(type2, () => {
          count2++;
        });

        // Send message of type1
        store.getState().notifyListeners({
          type: type1,
          data: { message: "Test" },
        } as any);

        // Only type1 listener should be notified
        expect(count1).toBe(1);
        expect(count2).toBe(0);

        // Send message of type2
        store.getState().notifyListeners({
          type: type2,
          data: { message: "Test" },
        } as any);

        // Now both should have been notified once
        expect(count1).toBe(1);
        expect(count2).toBe(1);

        // Clean up
        unsubscribe1();
        unsubscribe2();

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Subscription cleanup doesn't affect store state
   *
   * Unsubscribing should only remove the listener, not affect other store state.
   */
  test("Subscription cleanup doesn't affect store state", () => {
    fc.assert(
      fc.property(messageTypeArb, (messageType) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Get initial state
        const initialState = store.getState();
        const initialTaskCount = Object.keys(initialState.tasks).length;
        const initialStatus = initialState.connectionStatus;

        // Subscribe and unsubscribe
        const unsubscribe = store.getState().subscribe(messageType, () => {});
        unsubscribe();

        // Get state after cleanup
        const finalState = store.getState();
        const finalTaskCount = Object.keys(finalState.tasks).length;
        const finalStatus = finalState.connectionStatus;

        // State should be unchanged
        expect(finalTaskCount).toBe(initialTaskCount);
        expect(finalStatus).toBe(initialStatus);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Rapid subscribe/unsubscribe cycles work correctly
   *
   * Rapidly subscribing and unsubscribing should not cause issues.
   */
  test("Rapid subscribe/unsubscribe cycles work correctly", () => {
    fc.assert(
      fc.property(messageTypeArb, fc.integer({ min: 1, max: 10 }), (messageType, cycleCount) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Perform multiple subscribe/unsubscribe cycles
        for (let i = 0; i < cycleCount; i++) {
          const unsubscribe = store.getState().subscribe(messageType, () => {});
          unsubscribe();
        }

        // Subscribe one final time
        let finalCount = 0;
        const finalUnsubscribe = store.getState().subscribe(messageType, () => {
          finalCount++;
        });

        // Send a message
        store.getState().notifyListeners({
          type: messageType,
          data: { message: "Test" },
        } as any);

        // Should receive exactly one notification
        expect(finalCount).toBe(1);

        finalUnsubscribe();

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Unsubscribe during notification is safe
   *
   * Unsubscribing while a notification is being processed should be safe.
   */
  test("Unsubscribe during notification is safe", () => {
    fc.assert(
      fc.property(messageTypeArb, (messageType) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        let notificationCount = 0;
        let unsubscribe: (() => void) | null = null;

        // Subscribe with a listener that unsubscribes itself
        unsubscribe = store.getState().subscribe(messageType, () => {
          notificationCount++;
          if (unsubscribe) {
            unsubscribe();
          }
        });

        // Send multiple messages
        store.getState().notifyListeners({
          type: messageType,
          data: { message: "Test 1" },
        } as any);
        store.getState().notifyListeners({
          type: messageType,
          data: { message: "Test 2" },
        } as any);

        // Should only receive one notification (unsubscribed after first)
        expect(notificationCount).toBe(1);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: All subscriptions can be cleaned up
   *
   * Creating and cleaning up many subscriptions should work correctly.
   */
  test("All subscriptions can be cleaned up", () => {
    fc.assert(
      fc.property(subscriberCountArb, (subscriberCount) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        const unsubscribers: (() => void)[] = [];

        // Create many subscribers
        for (let i = 0; i < subscriberCount; i++) {
          const unsubscribe = store.getState().subscribe("message", () => {});
          unsubscribers.push(unsubscribe);
        }

        // Clean up all subscribers
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }

        // Send a message
        let notificationCount = 0;
        const testUnsubscribe = store.getState().subscribe("message", () => {
          notificationCount++;
        });

        store.getState().notifyListeners({
          type: "message",
          data: { message: "Test" },
        } as any);

        // Only the new subscriber should be notified
        expect(notificationCount).toBe(1);

        testUnsubscribe();

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Subscription cleanup is memory safe
   *
   * Subscribing and unsubscribing should not leak memory (listeners should be removed).
   */
  test("Subscription cleanup removes listeners from store", () => {
    fc.assert(
      fc.property(messageTypeArb, subscriberCountArb, (messageType, subscriberCount) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        const unsubscribers: (() => void)[] = [];

        // Create subscribers
        for (let i = 0; i < subscriberCount; i++) {
          const unsubscribe = store.getState().subscribe(messageType, () => {});
          unsubscribers.push(unsubscribe);
        }

        // Get listener count before cleanup
        const state = store.getState();
        const listenersBefore = state.listeners[messageType]?.size || 0;
        expect(listenersBefore).toBe(subscriberCount);

        // Clean up all subscribers
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }

        // Get listener count after cleanup
        const stateAfter = store.getState();
        const listenersAfter = stateAfter.listeners[messageType]?.size || 0;
        expect(listenersAfter).toBe(0);

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
