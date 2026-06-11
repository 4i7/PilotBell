// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PROMPT_INPUT_PREFERENCES } from "../domain/inputPreferences";
import type { AttachedPromptFile } from "../domain/prompt";
import type { ProviderConfig } from "../domain/provider";
import { sendProviderPrompt } from "../lib/providerCommands";
import { usePromptSending } from "./usePromptSending";

vi.mock("../lib/providerCommands", () => ({
  sendProviderPrompt: vi.fn(),
}));

const provider: ProviderConfig = {
  id: "provider-1",
  kind: "ollama",
  name: "Local Ollama",
  endpoint: "http://127.0.0.1:11434/api/generate",
  model: "llama3",
  hasSecret: false,
  advancedEndpoint: false,
};

const composerAttachment: AttachedPromptFile = {
  id: "attachment-1",
  name: "composer-notes.txt",
  size: 22,
  type: "text/plain",
  textContent: "Composer secret context",
};

type PromptSendingApi = ReturnType<typeof usePromptSending>;

function Harness({
  attachedFiles,
  onReady,
  prompt,
}: {
  attachedFiles: AttachedPromptFile[];
  onReady: (api: PromptSendingApi) => void;
  prompt: string;
}) {
  const api = usePromptSending({
    attachedFiles,
    browserPreviewMessage: "Browser preview",
    inputPreferences: DEFAULT_PROMPT_INPUT_PREFERENCES,
    isTauriRuntime: true,
    prompt,
    promptRef: { current: null },
    selectedProvider: provider,
    addSessionEntry: vi.fn(),
    clearAttachments: vi.fn(),
    openProviderSettings: vi.fn(),
    setChatStatus: vi.fn(),
    setPrompt: vi.fn(),
    toneForProviderError: () => "error",
  });

  onReady(api);
  return null;
}

describe("usePromptSending attachment overrides", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: PromptSendingApi;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(sendProviderPrompt).mockResolvedValue({
      status: "success",
      data: {
        content: "Reply",
        provider: provider.name,
        model: provider.model,
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("uses an explicit empty attachment override for retry sends", async () => {
    act(() => {
      root.render(
        <Harness
          attachedFiles={[composerAttachment]}
          onReady={(nextApi) => {
            api = nextApi;
          }}
          prompt="Composer prompt"
        />,
      );
    });

    await act(async () => {
      await api.sendPrompt("Retried prompt", provider, {
        ...DEFAULT_PROMPT_INPUT_PREFERENCES,
        attachments: [],
      });
    });

    expect(sendProviderPrompt).toHaveBeenCalledTimes(1);
    expect(sendProviderPrompt).toHaveBeenCalledWith("Retried prompt", provider);
    expect(vi.mocked(sendProviderPrompt).mock.calls[0]?.[0]).not.toContain(
      "Composer secret context",
    );
  });

  it("keeps normal composer review sends on the live attachments", async () => {
    act(() => {
      root.render(
        <Harness
          attachedFiles={[composerAttachment]}
          onReady={(nextApi) => {
            api = nextApi;
          }}
          prompt="Composer prompt"
        />,
      );
    });

    act(() => {
      api.requestPromptSubmit();
    });
    expect(sendProviderPrompt).not.toHaveBeenCalled();

    await act(async () => {
      api.approvePromptReview();
    });

    expect(sendProviderPrompt).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendProviderPrompt).mock.calls[0]?.[0]).toContain(
      "Composer secret context",
    );
  });
});
