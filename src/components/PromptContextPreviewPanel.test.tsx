// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PromptContextPreview } from "../domain/prompt";
import { PromptContextPreviewPanel } from "./PromptContextPreviewPanel";

const basePreview: PromptContextPreview = {
  title: "Prompt context review",
  helperText: "Review this prompt.",
  contextTitle: "Attachments",
  emptyContextMessage: "No local attachment context is queued for this send.",
  approveLabel: "Send reviewed prompt",
  preparedPrompt: "hello",
  providerLabel: "OpenAI / gpt-4.1-mini",
  providerEndpoint: "https://api.openai.com/v1/responses",
  providerHost: "api.openai.com",
  providerRisk: {
    tone: "neutral",
    summary: "Cloud provider.",
  },
  contextItems: [],
  warnings: [],
  estimatedChars: 5,
  requiresCloudReview: true,
  requiresReview: true,
  requiresExplicitOptIn: false,
  secretWillBeUsed: true,
  storedSecretAvailable: true,
  storedSecretAvailabilitySource: "diagnosed",
  reviewReason: "Cloud-bound sends require review before PilotBell transmits the prompt.",
};

describe("PromptContextPreviewPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("labels stored API key availability when metadata fallback was used", () => {
    act(() => {
      root.render(
        <PromptContextPreviewPanel
          preview={{
            ...basePreview,
            storedSecretAvailabilitySource: "metadata",
          }}
          onApprove={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain("Stored API key available: Yes (metadata)");
  });
});
