import type { ProviderConfig } from "../../domain/provider";

type ProviderActionsProps = {
  editingProvider: ProviderConfig | null;
  isProviderActionsDisabled: boolean;
  isTauriRuntime: boolean;
  isSavingProvider: boolean;
  applyOpenAIPreset: () => void;
  applyAnthropicPreset: () => void;
  applyOllamaPreset: () => void;
  applyLlamaCppPreset: () => void;
  addProvider: () => void;
  updateProvider: () => void;
  cancelProviderEdit: () => void;
};

export function ProviderActions({
  editingProvider,
  isProviderActionsDisabled,
  isTauriRuntime,
  isSavingProvider,
  applyOpenAIPreset,
  applyAnthropicPreset,
  applyOllamaPreset,
  applyLlamaCppPreset,
  addProvider,
  updateProvider,
  cancelProviderEdit,
}: ProviderActionsProps) {
  return (
    <div className="settings-actions">
      <button
        type="button"
        className="button-preset"
        onClick={applyOpenAIPreset}
        disabled={isProviderActionsDisabled}
      >
        Use OpenAI preset
      </button>
      <button
        type="button"
        className="button-preset"
        onClick={applyAnthropicPreset}
        disabled={isProviderActionsDisabled}
      >
        Use Anthropic preset
      </button>
      <button
        type="button"
        className="button-preset"
        onClick={applyOllamaPreset}
        disabled={isProviderActionsDisabled}
      >
        Use Ollama preset
      </button>
      <button
        type="button"
        className="button-preset"
        onClick={applyLlamaCppPreset}
        disabled={isProviderActionsDisabled}
      >
        Use llama.cpp preset
      </button>
      <button
        type="button"
        className="button-save"
        onClick={() => (editingProvider ? void updateProvider() : void addProvider())}
        disabled={!isTauriRuntime || isProviderActionsDisabled}
      >
        {isSavingProvider
          ? editingProvider
            ? "Updating..."
            : "Saving..."
          : editingProvider
            ? "Update provider"
            : "Save provider"}
      </button>
      {editingProvider ? (
        <button
          type="button"
          className="secondary"
          onClick={cancelProviderEdit}
          disabled={isProviderActionsDisabled}
        >
          Cancel edit
        </button>
      ) : null}
    </div>
  );
}
