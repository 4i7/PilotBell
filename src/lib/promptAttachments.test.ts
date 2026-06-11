import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildDocumentContextPreview, buildPromptContextPreview } from "./promptAttachments";
import { diagnoseProviderSecret } from "./providerCommands";

vi.mock("./providerCommands", () => ({
  diagnoseProviderSecret: vi.fn(),
}));

describe("prompt context review signals", () => {
  beforeEach(() => {
    vi.mocked(diagnoseProviderSecret).mockReset();
    vi.mocked(diagnoseProviderSecret).mockResolvedValue({
      status: "success",
      data: {
        providerId: "provider-openai",
        hasSecret: true,
        message: "Stored provider secret is available.",
      },
    });
  });

  it("requires review for cloud sends even without attachments", async () => {
    const preview = await buildPromptContextPreview("hello", [], {
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
    expect(preview.storedSecretAvailable).toBe(true);
    expect(preview.storedSecretAvailabilitySource).toBe("diagnosed");
    expect(preview.contextItems).toHaveLength(0);
  });

  it("requires explicit opt-in for advanced endpoints", async () => {
    const preview = await buildPromptContextPreview("hello", [], {
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

  it("shows document-context truncation when report wording payload is shortened", async () => {
    const preview = await buildDocumentContextPreview(
      {
        jobId: "document-1",
        fileName: "Q2-report.pdf",
        selectedTemplate: "summary-report",
        markdownContent: `# Review\n\n${"A".repeat(12_500)}`,
      },
      {
        id: "provider-openai",
        kind: "openai-responses",
        name: "OpenAI",
        endpoint: "https://api.openai.com/v1/responses",
        model: "gpt-4.1-mini",
        hasSecret: true,
        advancedEndpoint: false,
      },
    );

    expect(preview.title).toBe("Document context review");
    expect(preview.contextTitle).toBe("Document context");
    expect(preview.requiresCloudReview).toBe(true);
    expect(preview.contextItems).toHaveLength(1);
    expect(preview.contextItems[0]?.textTruncated).toBe(true);
    expect(preview.contextItems[0]?.includedCharCount).toBe(12_000);
    expect(preview.warnings.some((warning) => warning.includes("truncated"))).toBe(true);
    expect(preview.preparedPrompt).toContain("PilotBell-generated Markdown review draft:");
    expect(preview.helperText).toContain("same helper");
  });

  it("redacts local paths from document wording provider payloads", async () => {
    const preview = await buildDocumentContextPreview(
      {
        jobId: "document-1",
        fileName: "Q2-report.pdf",
        selectedTemplate: "summary-report",
        markdownContent:
          "# Review\n\n## Source\n\n- File: `Q2-report.pdf`\n- Path: `C:\\Users\\4i7\\Private\\Q2-report.pdf`\n- Type: `pdf`",
      },
      {
        id: "provider-openai",
        kind: "openai-responses",
        name: "OpenAI",
        endpoint: "https://api.openai.com/v1/responses",
        model: "gpt-4.1-mini",
        hasSecret: true,
        advancedEndpoint: false,
      },
    );

    expect(preview.preparedPrompt).not.toContain("C:\\Users\\4i7\\Private\\Q2-report.pdf");
    expect(preview.contextItems[0]?.excerpt).not.toContain(
      "C:\\Users\\4i7\\Private\\Q2-report.pdf",
    );
    expect(preview.preparedPrompt).toContain("- Path: `[redacted local path]`");
    expect(preview.contextItems[0]?.excerpt).toContain("- Path: `[redacted local path]`");
  });

  it("uses diagnosed missing keyring state over positive provider metadata", async () => {
    vi.mocked(diagnoseProviderSecret).mockResolvedValueOnce({
      status: "success",
      data: {
        providerId: "provider-openai",
        hasSecret: false,
        message: "Stored provider secret is missing.",
      },
    });

    const preview = await buildPromptContextPreview("hello", [], {
      id: "provider-openai",
      kind: "openai-responses",
      name: "OpenAI",
      endpoint: "https://api.openai.com/v1/responses",
      model: "gpt-4.1-mini",
      hasSecret: true,
      advancedEndpoint: false,
    });

    expect(preview.storedSecretAvailable).toBe(false);
    expect(preview.storedSecretAvailabilitySource).toBe("diagnosed");
    expect(preview.warnings.some((warning) => warning.includes("unavailable"))).toBe(true);
  });

  it("uses diagnosed missing keyring state for document context previews", async () => {
    vi.mocked(diagnoseProviderSecret).mockResolvedValueOnce({
      status: "success",
      data: {
        providerId: "provider-openai",
        hasSecret: false,
        message: "Stored provider secret is missing.",
      },
    });

    const preview = await buildDocumentContextPreview(
      {
        jobId: "document-1",
        fileName: "Q2-report.pdf",
        selectedTemplate: "summary-report",
        markdownContent: "# Review\n\nDocument-derived Markdown.",
      },
      {
        id: "provider-openai",
        kind: "openai-responses",
        name: "OpenAI",
        endpoint: "https://api.openai.com/v1/responses",
        model: "gpt-4.1-mini",
        hasSecret: true,
        advancedEndpoint: false,
      },
    );

    expect(preview.storedSecretAvailable).toBe(false);
    expect(preview.storedSecretAvailabilitySource).toBe("diagnosed");
    expect(preview.warnings.some((warning) => warning.includes("unavailable"))).toBe(true);
  });

  it("falls back to provider metadata when secret diagnosis returns an error", async () => {
    vi.mocked(diagnoseProviderSecret).mockResolvedValueOnce({
      status: "error",
      error: {
        kind: "internal",
        message: "Tauri command unavailable.",
        retryable: false,
      },
    });

    const preview = await buildPromptContextPreview("hello", [], {
      id: "provider-openai",
      kind: "openai-responses",
      name: "OpenAI",
      endpoint: "https://api.openai.com/v1/responses",
      model: "gpt-4.1-mini",
      hasSecret: true,
      advancedEndpoint: false,
    });

    expect(preview.storedSecretAvailable).toBe(true);
    expect(preview.storedSecretAvailabilitySource).toBe("metadata");
  });

  it("falls back to provider metadata when secret diagnosis throws", async () => {
    vi.mocked(diagnoseProviderSecret).mockRejectedValueOnce(new Error("invoke unavailable"));

    const preview = await buildPromptContextPreview("hello", [], {
      id: "provider-openai",
      kind: "openai-responses",
      name: "OpenAI",
      endpoint: "https://api.openai.com/v1/responses",
      model: "gpt-4.1-mini",
      hasSecret: false,
      advancedEndpoint: false,
    });

    expect(preview.storedSecretAvailable).toBe(false);
    expect(preview.storedSecretAvailabilitySource).toBe("metadata");
  });

  it("does not diagnose providers that do not require API keys", async () => {
    const preview = await buildPromptContextPreview("hello", [], {
      id: "provider-ollama",
      kind: "ollama",
      name: "Local Ollama",
      endpoint: "http://127.0.0.1:11434/api/generate",
      model: "llama3",
      hasSecret: true,
      advancedEndpoint: false,
    });

    expect(diagnoseProviderSecret).not.toHaveBeenCalled();
    expect(preview.storedSecretAvailable).toBe(false);
    expect(preview.storedSecretAvailabilitySource).toBe("metadata");
  });
});
