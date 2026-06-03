// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  loadProviderState,
  replaceLegacyProvidersWithMetadata,
  sanitizeLegacyProvidersToMetadata,
  PROVIDER_STORAGE_KEY,
} from "./providerStore";

describe("providerStore legacy secret handling", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads legacy providers separately from metadata-only providers", () => {
    localStorage.setItem(
      PROVIDER_STORAGE_KEY,
      JSON.stringify([
        {
          id: "provider-legacy",
          name: "Legacy OpenAI",
          kind: "openai-responses",
          endpoint: "https://api.openai.com/v1/responses",
          model: "gpt-4.1-mini",
          apiKey: "legacy-secret",
        },
      ]),
    );

    const state = loadProviderState();

    expect(state.providers).toEqual([]);
    expect(state.legacyProviders).toHaveLength(1);
    expect(state.legacyProviders[0]?.apiKey).toBe("legacy-secret");
  });

  it("replaces legacy providers with metadata-only providers and scrubs browser-stored API keys", () => {
    const sanitized = replaceLegacyProvidersWithMetadata([
      {
        id: "provider-legacy",
        name: "Legacy OpenAI",
        kind: "openai-responses",
        endpoint: "https://api.openai.com/v1/responses",
        model: "gpt-4.1-mini",
        apiKey: "legacy-secret",
      },
    ]);

    expect(sanitized).toEqual(
      sanitizeLegacyProvidersToMetadata([
        {
          id: "provider-legacy",
          name: "Legacy OpenAI",
          kind: "openai-responses",
          endpoint: "https://api.openai.com/v1/responses",
          model: "gpt-4.1-mini",
          apiKey: "legacy-secret",
        },
      ]),
    );

    expect(localStorage.getItem(PROVIDER_STORAGE_KEY)).not.toContain("legacy-secret");
    expect(loadProviderState().legacyProviders).toEqual([]);
    expect(loadProviderState().providers[0]?.hasSecret).toBe(false);
  });
});
