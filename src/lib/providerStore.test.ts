// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import type { LegacyProviderConfig } from "../domain/provider";
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
    const legacyProviders: LegacyProviderConfig[] = [
      {
        id: "provider-legacy",
        name: "Legacy OpenAI",
        kind: "openai-responses",
        endpoint: "https://api.openai.com/v1/responses",
        model: "gpt-4.1-mini",
        apiKey: "legacy-secret",
      },
    ];
    const sanitized = replaceLegacyProvidersWithMetadata(legacyProviders, []);

    expect(sanitized).toEqual(sanitizeLegacyProvidersToMetadata(legacyProviders));

    expect(localStorage.getItem(PROVIDER_STORAGE_KEY)).not.toContain("legacy-secret");
    expect(loadProviderState().legacyProviders).toEqual([]);
    expect(loadProviderState().providers[0]?.hasSecret).toBe(false);
  });

  it("scrubs legacy providers without deleting existing metadata-only providers", () => {
    localStorage.setItem(
      PROVIDER_STORAGE_KEY,
      JSON.stringify([
        {
          id: "provider-metadata",
          name: "Metadata Anthropic",
          kind: "anthropic-messages",
          endpoint: "https://api.anthropic.example/v1/messages",
          model: "claude-sonnet",
          hasSecret: true,
          advancedEndpoint: true,
        },
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
    const scrubbed = replaceLegacyProvidersWithMetadata(state.legacyProviders, state.providers);

    expect(scrubbed).toEqual([
      {
        id: "provider-metadata",
        name: "Metadata Anthropic",
        kind: "anthropic-messages",
        endpoint: "https://api.anthropic.example/v1/messages",
        model: "claude-sonnet",
        hasSecret: true,
        advancedEndpoint: true,
      },
      {
        id: "provider-legacy",
        name: "Legacy OpenAI",
        kind: "openai-responses",
        endpoint: "https://api.openai.com/v1/responses",
        model: "gpt-4.1-mini",
        hasSecret: false,
        advancedEndpoint: false,
      },
    ]);
    expect(localStorage.getItem(PROVIDER_STORAGE_KEY)).not.toContain("legacy-secret");
    expect(loadProviderState().legacyProviders).toEqual([]);
  });

  it("replaces matching metadata and legacy ids without duplicating providers", () => {
    localStorage.setItem(
      PROVIDER_STORAGE_KEY,
      JSON.stringify([
        {
          id: "provider-shared",
          name: "Metadata OpenAI",
          kind: "openai-responses",
          endpoint: "https://metadata.example/v1/responses",
          model: "gpt-4.1",
          hasSecret: true,
        },
        {
          id: "provider-shared",
          name: "Legacy OpenAI",
          kind: "openai-responses",
          endpoint: "https://api.openai.com/v1/responses",
          model: "gpt-4.1-mini",
          apiKey: "legacy-secret",
        },
      ]),
    );

    const state = loadProviderState();
    const scrubbed = replaceLegacyProvidersWithMetadata(state.legacyProviders, state.providers);

    expect(scrubbed).toEqual([
      {
        id: "provider-shared",
        name: "Legacy OpenAI",
        kind: "openai-responses",
        endpoint: "https://api.openai.com/v1/responses",
        model: "gpt-4.1-mini",
        hasSecret: false,
        advancedEndpoint: false,
      },
    ]);
    expect(new Set(scrubbed.map((provider) => provider.id)).size).toBe(scrubbed.length);
    expect(localStorage.getItem(PROVIDER_STORAGE_KEY)).not.toContain("legacy-secret");
  });
});
