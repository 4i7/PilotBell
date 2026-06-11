// @vitest-environment jsdom

import { act, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANTHROPIC_PROVIDER_KIND,
  DEFAULT_PROVIDER_KIND,
  OLLAMA_PROVIDER_KIND,
  type ProviderConfig,
  type ProviderDraft,
} from "../../domain/provider";
import { deleteProviderSecret, storeProviderSecret } from "../../lib/providerCommands";
import type { ProviderStatus } from "./types";
import { useProviderSaveActions } from "./useProviderSaveActions";

vi.mock("../../lib/providerCommands", () => ({
  deleteProviderSecret: vi.fn(),
  storeProviderSecret: vi.fn(),
}));

type SaveActionsApi = ReturnType<typeof useProviderSaveActions>;

const openAiProvider: ProviderConfig = {
  id: "provider-openai",
  kind: DEFAULT_PROVIDER_KIND,
  name: "OpenAI",
  endpoint: "https://api.openai.com/v1/responses",
  model: "gpt-4.1-mini",
  hasSecret: true,
  advancedEndpoint: false,
};

const openAiDraft: ProviderDraft = {
  kind: DEFAULT_PROVIDER_KIND,
  name: "OpenAI",
  endpoint: "https://api.openai.com/v1/responses",
  apiKey: "",
  model: "gpt-4.1-mini",
  advancedEndpoint: false,
};

function Harness({
  editingProvider,
  onReady,
  providerDraft,
  providers,
  setProviderStatus,
  setProviders,
}: {
  editingProvider: ProviderConfig;
  onReady: (api: SaveActionsApi) => void;
  providerDraft: ProviderDraft;
  providers: ProviderConfig[];
  setProviderStatus: Dispatch<SetStateAction<ProviderStatus | null>>;
  setProviders: Dispatch<SetStateAction<ProviderConfig[]>>;
}) {
  const api = useProviderSaveActions({
    browserPreviewMessage: "Browser preview",
    editingProvider,
    isTauriRuntime: true,
    providerDraft,
    providers,
    removeProviderHealthRecord: vi.fn(),
    resetProviderDraft: vi.fn(),
    setProviderDraft: vi.fn(),
    setProviders,
    setProviderStatus,
    setSelectedProviderId: vi.fn(),
    toneForProviderError: () => "error",
  });

  onReady(api);
  return null;
}

describe("useProviderSaveActions provider kind switches", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: SaveActionsApi;
  let setProviderStatus: ReturnType<
    typeof vi.fn<(status: SetStateAction<ProviderStatus | null>) => void>
  >;
  let setProviders: ReturnType<
    typeof vi.fn<(providers: SetStateAction<ProviderConfig[]>) => void>
  >;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    setProviderStatus = vi.fn();
    setProviders = vi.fn();
    vi.mocked(storeProviderSecret).mockResolvedValue({
      status: "success",
      data: { providerId: openAiProvider.id, message: "Stored provider secret." },
    });
    vi.mocked(deleteProviderSecret).mockResolvedValue({
      status: "success",
      data: { providerId: openAiProvider.id, message: "Deleted provider secret." },
    });
    localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  function renderSaveActions(providerDraft: ProviderDraft, editingProvider = openAiProvider) {
    act(() => {
      root.render(
        <Harness
          editingProvider={editingProvider}
          onReady={(nextApi) => {
            api = nextApi;
          }}
          providerDraft={providerDraft}
          providers={[editingProvider]}
          setProviderStatus={setProviderStatus}
          setProviders={setProviders}
        />,
      );
    });
  }

  it("requires a new API key when switching to another secret-backed provider kind", async () => {
    renderSaveActions({
      kind: ANTHROPIC_PROVIDER_KIND,
      name: "Anthropic",
      endpoint: "https://api.anthropic.com/v1/messages",
      apiKey: "",
      model: "claude-sonnet-4-20250514",
      advancedEndpoint: false,
    });

    await act(async () => {
      await api.updateProvider();
    });

    expect(setProviderStatus).toHaveBeenCalledWith({
      tone: "warning",
      message: "Provider update failed: switching provider types requires a new API key.",
    });
    expect(storeProviderSecret).not.toHaveBeenCalled();
    expect(deleteProviderSecret).not.toHaveBeenCalled();
    expect(setProviders).not.toHaveBeenCalled();
  });

  it("keeps the existing secret when the provider kind is unchanged and the API key is empty", async () => {
    renderSaveActions(openAiDraft);

    await act(async () => {
      await api.updateProvider();
    });

    expect(storeProviderSecret).not.toHaveBeenCalled();
    expect(deleteProviderSecret).not.toHaveBeenCalled();
    expect(setProviders).toHaveBeenCalledWith([
      expect.objectContaining({
        id: openAiProvider.id,
        kind: DEFAULT_PROVIDER_KIND,
        hasSecret: true,
      }),
    ]);
  });

  it("deletes the old secret when switching from a hosted provider to a local provider", async () => {
    renderSaveActions({
      kind: OLLAMA_PROVIDER_KIND,
      name: "Ollama",
      endpoint: "http://127.0.0.1:11434/api/generate",
      apiKey: "",
      model: "llama3.2",
      advancedEndpoint: false,
    });

    await act(async () => {
      await api.updateProvider();
    });

    expect(storeProviderSecret).not.toHaveBeenCalled();
    expect(deleteProviderSecret).toHaveBeenCalledWith(openAiProvider.id);
    expect(setProviders).toHaveBeenCalledWith([
      expect.objectContaining({
        id: openAiProvider.id,
        kind: OLLAMA_PROVIDER_KIND,
        hasSecret: false,
      }),
    ]);
  });
});
