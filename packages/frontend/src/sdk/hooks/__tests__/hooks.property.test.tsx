/**
 * Property-based tests for SDK hooks
 * Feature: frontend-sdk, Property 2: Hook Context Dependency
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { describe, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import * as fc from "fast-check";
import { useConnection } from "../useConnection";
import { useMentions } from "../useMentions";
import { useMessages } from "../useMessages";
import { useSendMessage } from "../useSendMessage";
import { useTasks } from "../useTasks";
import { useWebSocket } from "../useWebSocket";

// Import setup to configure DOM environment
import "../../provider/__tests__/setup";

/**
 * Property 2: Hook Context Dependency
 *
 * For any SDK hook (useMessages, useConnection, useTasks, etc.),
 * calling the hook outside of a WebSocketProvider should throw a descriptive error.
 *
 * This property ensures that all hooks properly enforce the requirement to be used
 * within a WebSocketProvider, providing clear error messages to developers.
 */
describe("Property 2: Hook Context Dependency", () => {
  const hooks = [
    { name: "useWebSocket", hook: useWebSocket },
    { name: "useConnection", hook: useConnection },
    { name: "useMessages", hook: useMessages },
    { name: "useTasks", hook: useTasks },
    { name: "useMentions", hook: useMentions },
    { name: "useSendMessage", hook: useSendMessage },
  ];

  test.each(hooks)("Property 2: $name throws error when used outside WebSocketProvider", ({
    hook,
  }) => {
    // Attempt to render the hook outside of a provider
    const { result } = renderHook(() => {
      try {
        return hook();
      } catch (error) {
        return error;
      }
    });

    // Verify that an error was thrown
    expect(result.current).toBeInstanceOf(Error);

    // Verify the error message is descriptive
    const error = result.current as Error;
    expect(error.message).toContain("WebSocketProvider");
    expect(error.message).toContain("must be used within");
  });

  test("Property 2: All hooks throw consistent error messages", () => {
    fc.assert(
      fc.property(fc.constantFrom(...hooks), (hookConfig) => {
        // Render hook outside provider
        const { result } = renderHook(() => {
          try {
            return hookConfig.hook();
          } catch (error) {
            return error;
          }
        });

        // All hooks should throw an error
        expect(result.current).toBeInstanceOf(Error);

        // Error message should mention WebSocketProvider
        const error = result.current as Error;
        expect(error.message).toContain("WebSocketProvider");

        return true;
      }),
      { numRuns: 100 },
    );
  });

  test("Property 2: Error messages are helpful for developers", () => {
    fc.assert(
      fc.property(fc.constantFrom(...hooks), (hookConfig) => {
        const { result } = renderHook(() => {
          try {
            return hookConfig.hook();
          } catch (error) {
            return error;
          }
        });

        const error = result.current as Error;

        // Error should be an Error instance
        expect(error).toBeInstanceOf(Error);

        // Error message should be helpful
        const message = error.message.toLowerCase();
        expect(
          message.includes("websocketprovider") &&
            (message.includes("must be used within") ||
              message.includes("wrap") ||
              message.includes("provider")),
        ).toBe(true);

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
