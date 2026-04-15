import { describe, expect, it } from "bun:test";
import type { LanguageRuntimeHost, StdioProcess } from "@amigo-llm/backend";
import { LspClient } from "../lspClient";

const encodeMessage = (message: unknown): Uint8Array => {
  const payload = JSON.stringify(message);
  return Buffer.from(
    `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`,
    "utf8",
  );
};

describe("LspClient", () => {
  it("registers pending initialize requests before writing so fast responses are not dropped", async () => {
    const stdoutListeners = new Set<(chunk: Uint8Array) => void>();
    const stderrListeners = new Set<(chunk: Uint8Array) => void>();
    const exitListeners = new Set<(event: { code?: number; signal?: string }) => void>();
    let writeCount = 0;

    const process: StdioProcess = {
      async write(data) {
        writeCount += 1;
        const text = Buffer.from(data).toString("utf8");
        if (writeCount === 1 && text.includes('"method":"initialize"')) {
          stdoutListeners.forEach((listener) => {
            listener(
              encodeMessage({
                jsonrpc: "2.0",
                id: 1,
                result: {
                  capabilities: {},
                },
              }),
            );
          });
        }
      },
      async closeInput() {},
      async kill() {
        exitListeners.forEach((listener) => {
          listener({ signal: "SIGTERM" });
        });
      },
      onStdout(listener) {
        stdoutListeners.add(listener);
        return () => {
          stdoutListeners.delete(listener);
        };
      },
      onStderr(listener) {
        stderrListeners.add(listener);
        return () => {
          stderrListeners.delete(listener);
        };
      },
      onExit(listener) {
        exitListeners.add(listener);
        return () => {
          exitListeners.delete(listener);
        };
      },
    };

    const host: LanguageRuntimeHost = {
      id: "task-1",
      cwd: "/workspace",
      runCommand: async () => "",
      spawnStdioProcess: async () => process,
    };

    const client = new LspClient({
      host,
      workspaceRoot: "/workspace",
      runtimeContext: {
        taskId: "task-1",
        filePath: "/workspace/src/example.ts",
        host,
      },
      server: {
        id: "ts",
        languageIds: ["typescript"],
        fileExtensions: [".ts"],
        command: "typescript-language-server",
        args: ["--stdio"],
        requestTimeoutMs: 50,
      },
    });

    await expect(client.start()).resolves.toBeUndefined();
  });
});
