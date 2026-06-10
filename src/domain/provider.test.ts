import { describe, expect, it } from "vitest";

import {
  ANTHROPIC_PROVIDER_KIND,
  DEFAULT_PROVIDER_KIND,
  LLAMA_CPP_PROVIDER_KIND,
  OLLAMA_PROVIDER_KIND,
  type ProviderDraft,
  classifyProviderEndpoint,
  isLoopbackEndpoint,
  isProviderDraftValid,
  isProviderKind,
  normalizeProviderDraft,
  officialEndpointForProvider,
  providerIsCloud,
  providerRequiresApiKey,
} from "./provider";

// Regression tests for provider adapter endpoint normalization and safety
// warnings (issue #41). Routing and endpoint classification are security
// sensitive: cloud API keys must not silently go to a custom URL, and local
// providers must only accept LAN/external endpoints under an explicit advanced
// mode. These tests pin that behavior so regressions fail CI.

describe("provider kind predicates", () => {
  it("recognizes the four supported provider kinds and rejects others", () => {
    expect(isProviderKind(DEFAULT_PROVIDER_KIND)).toBe(true);
    expect(isProviderKind(ANTHROPIC_PROVIDER_KIND)).toBe(true);
    expect(isProviderKind(OLLAMA_PROVIDER_KIND)).toBe(true);
    expect(isProviderKind(LLAMA_CPP_PROVIDER_KIND)).toBe(true);
    expect(isProviderKind("gemini")).toBe(false);
    expect(isProviderKind(undefined)).toBe(false);
    expect(isProviderKind(42)).toBe(false);
  });

  it("treats only the hosted cloud providers as cloud and as requiring an API key", () => {
    expect(providerIsCloud(DEFAULT_PROVIDER_KIND)).toBe(true);
    expect(providerIsCloud(ANTHROPIC_PROVIDER_KIND)).toBe(true);
    expect(providerIsCloud(OLLAMA_PROVIDER_KIND)).toBe(false);
    expect(providerIsCloud(LLAMA_CPP_PROVIDER_KIND)).toBe(false);

    expect(providerRequiresApiKey(DEFAULT_PROVIDER_KIND)).toBe(true);
    expect(providerRequiresApiKey(ANTHROPIC_PROVIDER_KIND)).toBe(true);
    expect(providerRequiresApiKey(OLLAMA_PROVIDER_KIND)).toBe(false);
    expect(providerRequiresApiKey(LLAMA_CPP_PROVIDER_KIND)).toBe(false);
  });
});

describe("official hosted endpoints", () => {
  it("returns the expected official endpoint for each provider kind", () => {
    expect(officialEndpointForProvider(DEFAULT_PROVIDER_KIND)).toBe(
      "https://api.openai.com/v1/responses",
    );
    expect(officialEndpointForProvider(ANTHROPIC_PROVIDER_KIND)).toBe(
      "https://api.anthropic.com/v1/messages",
    );
    expect(officialEndpointForProvider(OLLAMA_PROVIDER_KIND)).toBe(
      "http://127.0.0.1:11434/api/generate",
    );
    expect(officialEndpointForProvider(LLAMA_CPP_PROVIDER_KIND)).toBe(
      "http://127.0.0.1:8080/v1/chat/completions",
    );
  });
});

describe("isLoopbackEndpoint", () => {
  it("treats localhost and loopback hosts as loopback", () => {
    expect(isLoopbackEndpoint("http://localhost:11434/api/generate")).toBe(true);
    expect(isLoopbackEndpoint("http://127.0.0.1:8080/v1/chat/completions")).toBe(true);
    expect(isLoopbackEndpoint("http://[::1]:11434/api/generate")).toBe(true);
    expect(isLoopbackEndpoint("http://[0:0:0:0:0:0:0:1]:11434/api/generate")).toBe(true);
  });

  it("treats LAN, external, and malformed endpoints as non-loopback", () => {
    expect(isLoopbackEndpoint("http://192.168.1.50:11434/api/generate")).toBe(false);
    expect(isLoopbackEndpoint("https://example.com/v1/chat/completions")).toBe(false);
    expect(isLoopbackEndpoint("http://localhost.:11434/api/generate")).toBe(false);
    expect(isLoopbackEndpoint("http://user:pass@localhost:11434/api/generate")).toBe(false);
    expect(isLoopbackEndpoint("not-a-valid-url")).toBe(false);
    expect(isLoopbackEndpoint("")).toBe(false);
  });
});

describe("classifyProviderEndpoint safety warnings", () => {
  it("treats the official cloud endpoint as a neutral, non-advanced endpoint", () => {
    const risk = classifyProviderEndpoint(DEFAULT_PROVIDER_KIND, "https://api.openai.com/v1/responses");
    expect(risk.isAdvanced).toBe(false);
    expect(risk.tone).toBe("neutral");
  });

  it("normalizes trailing slashes and case when matching the official endpoint", () => {
    const risk = classifyProviderEndpoint(
      ANTHROPIC_PROVIDER_KIND,
      "HTTPS://API.ANTHROPIC.COM/v1/messages/",
    );
    expect(risk.isAdvanced).toBe(false);
    expect(risk.tone).toBe("neutral");
  });

  it("flags a custom cloud endpoint as advanced and warns that keys may go to a non-standard URL", () => {
    const risk = classifyProviderEndpoint(DEFAULT_PROVIDER_KIND, "https://proxy.internal.example/v1/responses");
    expect(risk.isAdvanced).toBe(true);
    expect(risk.tone).toBe("warning");
    expect(risk.message.toLowerCase()).toContain("advanced");
  });

  it("does not treat URL parser edge cases as official hosted endpoints", () => {
    const endpoints = [
      "https://api.openai.com@evil.example/v1/responses",
      "https://user:pass@api.openai.com/v1/responses",
      "https://api.openai.com./v1/responses",
      "https://api.openai.com/v1/responses?redirect=https://evil.example",
      "https://api.openai.com/v1/responses#fragment",
    ];

    for (const endpoint of endpoints) {
      const risk = classifyProviderEndpoint(DEFAULT_PROVIDER_KIND, endpoint);
      expect(risk.isAdvanced).toBe(true);
      expect(risk.tone).toBe("warning");
    }
  });

  it("treats a local provider on a loopback endpoint as neutral and non-advanced", () => {
    const risk = classifyProviderEndpoint(OLLAMA_PROVIDER_KIND, "http://127.0.0.1:11434/api/generate");
    expect(risk.isAdvanced).toBe(false);
    expect(risk.tone).toBe("neutral");
  });

  it("flags a local provider on a LAN endpoint as advanced and warning", () => {
    const risk = classifyProviderEndpoint(OLLAMA_PROVIDER_KIND, "http://192.168.1.50:11434/api/generate");
    expect(risk.isAdvanced).toBe(true);
    expect(risk.tone).toBe("warning");
  });

  it("flags a local provider on an external endpoint as advanced and warning", () => {
    const risk = classifyProviderEndpoint(LLAMA_CPP_PROVIDER_KIND, "https://llm.example.com/v1/chat/completions");
    expect(risk.isAdvanced).toBe(true);
    expect(risk.tone).toBe("warning");
  });
});

describe("normalizeProviderDraft", () => {
  it("trims surrounding whitespace and preserves kind and advanced flag", () => {
    const draft: ProviderDraft = {
      kind: DEFAULT_PROVIDER_KIND,
      name: "  My Provider  ",
      endpoint: "  https://api.openai.com/v1/responses  ",
      apiKey: "  sk-secret  ",
      model: "  gpt-4o  ",
      advancedEndpoint: true,
    };
    expect(normalizeProviderDraft(draft)).toEqual({
      kind: DEFAULT_PROVIDER_KIND,
      name: "My Provider",
      endpoint: "https://api.openai.com/v1/responses",
      apiKey: "sk-secret",
      model: "gpt-4o",
      advancedEndpoint: true,
    });
  });
});

describe("isProviderDraftValid", () => {
  const base: ProviderDraft = {
    kind: DEFAULT_PROVIDER_KIND,
    name: "Provider",
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "sk-secret",
    model: "gpt-4o",
    advancedEndpoint: false,
  };

  it("requires name, endpoint, model, and (by default) an api key", () => {
    expect(isProviderDraftValid(base)).toBe(true);
    expect(isProviderDraftValid({ ...base, name: "" })).toBe(false);
    expect(isProviderDraftValid({ ...base, endpoint: "" })).toBe(false);
    expect(isProviderDraftValid({ ...base, model: "" })).toBe(false);
    expect(isProviderDraftValid({ ...base, apiKey: "" })).toBe(false);
  });

  it("allows an empty api key when requireApiKey is disabled (local providers)", () => {
    expect(isProviderDraftValid({ ...base, apiKey: "" }, { requireApiKey: false })).toBe(true);
  });
});
