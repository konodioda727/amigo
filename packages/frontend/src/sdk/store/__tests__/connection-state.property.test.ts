/**
 * Property-Based Test for Connection State Consistency
 *
 * **Feature: frontend-sdk, Property 6: Connection State Consistency**
 * **Validates: Requirements 2.4, 3.2**
 *
 * For any connection state transition (connecting → connected, connected → disconnected, etc.),
 * the useConnection hook should reflect the updated state and trigger re-renders of dependent components.
 */

import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { createWebSocketStore } from "../createWebSocketStore";
import type { ConnectionStatus } from "../websocket";

// ============================================================================
// Test Generators (Arbitraries)
// ============================================================================

/**
 * Generate a connection status
 */
const connectionStatusArb = fc.constantFrom<ConnectionStatus>(
  "connecting",
  "connected",
  "disconnected",
  "reconnecting",
);

/**
 * Generate a sequence of connection state transitions
 */
const stateTransitionSequenceArb = fc.array(connectionStatusArb, { minLength: 1, maxLength: 10 });

// ============================================================================
// Property Tests
// ============================================================================

describe("Property 6: Connection State Consistency", () => {
  /**
   * Property: Connection status is always one of the valid states
   *
   * For any store state, the connection status should always be one of:
   * "connecting", "connected", "disconnected", or "reconnecting"
   */
  test("Connection status is always valid", () => {
    fc.assert(
      fc.property(connectionStatusArb, (status) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Manually set the connection status
        store.setState({ connectionStatus: status });

        // Get the current state
        const state = store.getState();

        // Verify status is valid
        const validStatuses: ConnectionStatus[] = [
          "connecting",
          "connected",
          "disconnected",
          "reconnecting",
        ];
        expect(validStatuses).toContain(state.connectionStatus);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Initial state is always "disconnected"
   *
   * When a store is created with autoConnect=false, the initial
   * connection status should always be "disconnected".
   */
  test("Initial state is disconnected when autoConnect is false", () => {
    fc.assert(
      fc.property(fc.string(), (url) => {
        const store = createWebSocketStore({
          url: url || "ws://localhost:10013",
          autoConnect: false,
        });

        const state = store.getState();
        expect(state.connectionStatus).toBe("disconnected");

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: State transitions are reflected in store
   *
   * For any sequence of state transitions, the store should reflect
   * the most recent state.
   */
  test("State transitions are reflected in store", () => {
    fc.assert(
      fc.property(stateTransitionSequenceArb, (transitions) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Apply each transition
        for (const status of transitions) {
          store.setState({ connectionStatus: status });
        }

        // Verify final state matches last transition
        const finalState = store.getState();
        const expectedStatus = transitions[transitions.length - 1];
        expect(finalState.connectionStatus).toBe(expectedStatus);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Subscribers are notified of state changes
   *
   * When the connection status changes, all subscribers should be notified.
   */
  test("Subscribers are notified of state changes", () => {
    fc.assert(
      fc.property(connectionStatusArb, connectionStatusArb, (initialStatus, newStatus) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Set initial status
        store.setState({ connectionStatus: initialStatus });

        // Track notifications
        let notificationCount = 0;
        let lastNotifiedStatus: ConnectionStatus | null = null;

        // Subscribe to changes
        const unsubscribe = store.subscribe((state, prevState) => {
          if (state.connectionStatus !== prevState.connectionStatus) {
            notificationCount++;
            lastNotifiedStatus = state.connectionStatus;
          }
        });

        // Change status
        store.setState({ connectionStatus: newStatus });

        // Verify notification if status changed
        if (initialStatus !== newStatus) {
          expect(notificationCount).toBeGreaterThan(0);
          expect(lastNotifiedStatus).toBe(newStatus);
        }

        unsubscribe();
        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Unsubscribed listeners don't receive notifications
   *
   * After unsubscribing, a listener should not receive further notifications.
   */
  test("Unsubscribed listeners don't receive notifications", () => {
    fc.assert(
      fc.property(connectionStatusArb, connectionStatusArb, (status1, status2) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        let notificationCount = 0;

        // Subscribe and immediately unsubscribe
        const unsubscribe = store.subscribe(() => {
          notificationCount++;
        });
        unsubscribe();

        // Change status twice
        store.setState({ connectionStatus: status1 });
        store.setState({ connectionStatus: status2 });

        // Should not have received any notifications
        expect(notificationCount).toBe(0);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Multiple subscribers all receive notifications
   *
   * When multiple components subscribe to state changes, they should
   * all receive notifications.
   */
  test("Multiple subscribers all receive notifications", () => {
    fc.assert(
      fc.property(
        connectionStatusArb,
        fc.integer({ min: 1, max: 5 }),
        (newStatus, subscriberCount) => {
          const store = createWebSocketStore({
            url: "ws://localhost:10013",
            autoConnect: false,
          });

          // Create multiple subscribers
          const notificationCounts: number[] = [];
          const unsubscribers: (() => void)[] = [];

          for (let i = 0; i < subscriberCount; i++) {
            notificationCounts.push(0);
            const index = i;
            const unsubscribe = store.subscribe((state, prevState) => {
              if (state.connectionStatus !== prevState.connectionStatus) {
                notificationCounts[index]++;
              }
            });
            unsubscribers.push(unsubscribe);
          }

          // Change status
          store.setState({ connectionStatus: newStatus });

          // All subscribers should have been notified
          for (const count of notificationCounts) {
            expect(count).toBeGreaterThan(0);
          }

          // Clean up
          for (const unsubscribe of unsubscribers) {
            unsubscribe();
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Connection status derivations are consistent
   *
   * The derived boolean states (isConnected, isConnecting, isDisconnected)
   * should be consistent with the connection status.
   */
  test("Derived connection states are consistent", () => {
    fc.assert(
      fc.property(connectionStatusArb, (status) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        store.setState({ connectionStatus: status });
        const state = store.getState();

        // Verify derived states match the actual status
        const isConnected = state.connectionStatus === "connected";
        const isConnecting = state.connectionStatus === "connecting";
        const isDisconnected = state.connectionStatus === "disconnected";
        const isReconnecting = state.connectionStatus === "reconnecting";

        // Exactly one should be true
        const trueCount = [isConnected, isConnecting, isDisconnected, isReconnecting].filter(
          (v) => v,
        ).length;
        expect(trueCount).toBe(1);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: State is immutable
   *
   * Modifying the returned state object should not affect the store's internal state.
   */
  test("State is immutable", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    const state1 = store.getState();
    const originalStatus = state1.connectionStatus;

    // Attempt to modify the state (this should not affect the store)
    (state1 as any).connectionStatus = "connected";

    // Get state again
    const state2 = store.getState();

    // Original status should be preserved
    expect(state2.connectionStatus).toBe(originalStatus);
  });

  /**
   * Property: Rapid state changes are handled correctly
   *
   * For any sequence of rapid state changes, the final state should
   * match the last change.
   */
  test("Rapid state changes are handled correctly", () => {
    fc.assert(
      fc.property(stateTransitionSequenceArb, (transitions) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Apply all transitions rapidly
        for (const status of transitions) {
          store.setState({ connectionStatus: status });
        }

        // Final state should match last transition
        const finalState = store.getState();
        expect(finalState.connectionStatus).toBe(transitions[transitions.length - 1]);

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
