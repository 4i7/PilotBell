import { describe, expect, it } from "vitest";

import { buildDocumentContextPreview, buildPromptContextPreview } from "./promptAttachments";

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
    expect(preview.contextItems).toHaveLength(0);
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

  it("shows document-context truncation when report wording payload is shortened", () => {
    const preview = buildDocumentContextPreview(
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

  it("redacts local paths from document wording provider payloads", () => {
    const preview = buildDocumentContextPreview(
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
});
