import { afterEach, describe, expect, it } from "bun:test";
import { setGlobalState } from "@/globalState";
import { resolveModelConfig, resolveModelContextConfig } from "./contextConfig";

afterEach(() => {
  setGlobalState("modelConfigs", undefined);
  setGlobalState("modelContextConfigs", undefined);
});

describe("model config resolution", () => {
  it("resolves provider, baseURL and context settings from modelConfigs", () => {
    setGlobalState("modelConfigs", {
      ark: {
        provider: "openai-compatible",
        apiKey: "test-key",
        baseURL: "https://ark.example.com/api/v3",
        compressionThreshold: 0.75,
        targetRatio: 0.4,
        models: [
          {
            name: "doubao-seed-code",
            contextWindow: 262144,
            thinkType: "enabled",
          },
        ],
      },
    });

    const config = resolveModelConfig("doubao-seed-code");
    const contextConfig = resolveModelContextConfig("doubao-seed-code");

    expect(config).not.toBeNull();
    expect(config?.configId).toBe("ark");
    expect(config?.provider).toBe("openai-compatible");
    expect(config?.apiKey).toBe("test-key");
    expect(config?.baseURL).toBe("https://ark.example.com/api/v3");
    expect(config?.thinkType).toBe("enabled");
    expect(contextConfig?.contextWindow).toBe(262144);
    expect(contextConfig?.compressionThreshold).toBe(0.75);
    expect(contextConfig?.targetRatio).toBe(0.4);
  });

  it("supports provider-only config without enabling compression", () => {
    setGlobalState("modelConfigs", {
      ark: {
        provider: "openai-compatible",
        apiKey: "test-key",
        baseURL: "https://ark.example.com/api/v3",
        models: [
          {
            name: "doubao-seed-code",
          },
        ],
      },
    });

    const config = resolveModelConfig("doubao-seed-code");

    expect(config?.provider).toBe("openai-compatible");
    expect(config?.contextWindow).toBeUndefined();
    expect(resolveModelContextConfig("doubao-seed-code")).toBeNull();
  });

  it("falls back to legacy modelContextConfigs for backward compatibility", () => {
    setGlobalState("modelContextConfigs", {
      ark: {
        provider: "openai-compatible",
        apiKey: "test-key",
        contextWindow: 262144,
        models: [
          {
            name: "doubao-seed-code",
            contextWindow: 262144,
          },
        ],
      },
    });

    const contextConfig = resolveModelContextConfig("doubao-seed-code");

    expect(contextConfig?.contextWindow).toBe(262144);
    expect(contextConfig?.compressionThreshold).toBe(0.8);
    expect(contextConfig?.targetRatio).toBe(0.5);
  });
});
