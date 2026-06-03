import { describe, expect, it } from "vitest";

import { buildPromptContextPreview } from "./promptAttachments";

describe("prompt context review signals", () => {
  it("requires review for cloud sends even without attachments", () => {
    const preview = buildPromptContextPreview("hello", [], {
      id: "provider-openai",
      kind: "openai-responses",
      name: "OpenAI",
      endpoint: "https://api.openai.com/v1/responses",
      model: "gpt-4.1-mini",
      hasSecret: true,
      advancedEndpoint: false,
    });

    expect(preview.requiresCloudReview).toBe(true);
    expect(preview.requiresReview).toBe(true);
    expect(preview.requiresExplicitOptIn).toBe(false);
    expect(preview.secretWillBeUsed).toBe(true);
  });

  it("requires explicit opt-in for advanced endpoints", () => {
    const preview = buildPromptContextPreview("hello", [], {
      id: "provider-proxy",
      kind: "openai-responses",
      name: "Proxy",
      endpoint: "https://proxy.example.com/v1/responses",
      model: "gpt-4.1-mini",
      hasSecret: true,
      advancedEndpoint: true,
    });

    expect(preview.requiresExplicitOptIn).toBe(true);
    expect(preview.requiresReview).toBe(true);
    expect(preview.providerHost).toBe("proxy.example.com");
  });
});
