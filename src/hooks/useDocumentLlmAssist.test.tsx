// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewableDocumentJob } from "../domain/document";
import type { ProviderConfig } from "../domain/provider";
import { diagnoseProviderSecret, sendProviderPrompt } from "../lib/providerCommands";
import { useDocumentLlmAssist } from "./useDocumentLlmAssist";

vi.mock("../lib/providerCommands", () => ({
  diagnoseProviderSecret: vi.fn(),
  sendProviderPrompt: vi.fn(),
}));

const provider: ProviderConfig = {
  id: "provider-openai",
  kind: "openai-responses",
  name: "OpenAI",
  endpoint: "https://api.openai.com/v1/responses",
  model: "gpt-4.1-mini",
  hasSecret: true,
  advancedEndpoint: false,
};

const reviewableJob: ReviewableDocumentJob = {
  jobId: "document-1",
  fileName: "Q2-report.pdf",
  selectedTemplate: "summary-report",
  markdownContent: "# Review\n\nDocument-derived Markdown.",
};

type DocumentLlmAssistApi = ReturnType<typeof useDocumentLlmAssist>;

describe("useDocumentLlmAssist", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: DocumentLlmAssistApi;

  function Harness() {
    api = useDocumentLlmAssist({
      browserPreviewMessage: "Browser preview mode detected.",
      isTauriRuntime: true,
      selectedProvider: provider,
      openProviderSettings: () => undefined,
    });
    return null;
  }

  beforeEach(() => {
    vi.mocked(sendProviderPrompt).mockReset();
    vi.mocked(diagnoseProviderSecret).mockReset();
    vi.mocked(diagnoseProviderSecret).mockResolvedValue({
      status: "success",
      data: {
        providerId: provider.id,
        hasSecret: true,
        message: "Stored provider secret is available.",
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Harness />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("clears pending document context review before jobs are cleared", async () => {
    await act(async () => {
      await api.requestDocumentAssistReview(reviewableJob);
    });

    expect(api.pendingDocumentContextPreview).not.toBeNull();

    act(() => {
      api.clearDocumentAssistResult();
    });

    expect(api.pendingDocumentContextPreview).toBeNull();
    expect(api.documentAssistReplyError).toBeNull();

    await act(async () => {
      await api.approveDocumentAssistReview();
    });

    expect(sendProviderPrompt).not.toHaveBeenCalled();
  });
});
