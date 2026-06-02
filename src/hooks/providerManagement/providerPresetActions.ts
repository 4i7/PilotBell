import type { Dispatch, SetStateAction } from "react";

import {
  ANTHROPIC_PROVIDER_KIND,
  DEFAULT_PROVIDER_KIND,
  LLAMA_CPP_PROVIDER_KIND,
  OLLAMA_PROVIDER_KIND,
  type ProviderDraft,
} from "../../domain/provider";
import {
  ANTHROPIC_PROVIDER_DRAFT,
  DEFAULT_PROVIDER_DRAFT,
  LLAMA_CPP_PROVIDER_DRAFT,
  OLLAMA_PROVIDER_DRAFT,
} from "../../lib/providerDrafts";

type SetProviderDraft = Dispatch<SetStateAction<ProviderDraft>>;

export function createProviderPresetActions(setProviderDraft: SetProviderDraft) {
  function applyOpenAIPreset() {
    setProviderDraft((current) => ({
      ...current,
      ...DEFAULT_PROVIDER_DRAFT,
      name:
        current.name.trim() && current.kind === DEFAULT_PROVIDER_KIND
          ? current.name
          : DEFAULT_PROVIDER_DRAFT.name,
      model:
        current.model.trim() && current.kind === DEFAULT_PROVIDER_KIND
          ? current.model
          : DEFAULT_PROVIDER_DRAFT.model,
    }));
  }

  function applyAnthropicPreset() {
    setProviderDraft((current) => ({
      ...current,
      ...ANTHROPIC_PROVIDER_DRAFT,
      name:
        current.name.trim() && current.kind === ANTHROPIC_PROVIDER_KIND
          ? current.name
          : ANTHROPIC_PROVIDER_DRAFT.name,
      model:
        current.model.trim() && current.kind === ANTHROPIC_PROVIDER_KIND
          ? current.model
          : ANTHROPIC_PROVIDER_DRAFT.model,
    }));
  }

  function applyOllamaPreset() {
    setProviderDraft((current) => ({
      ...current,
      ...OLLAMA_PROVIDER_DRAFT,
      name: current.name.trim() && current.kind === OLLAMA_PROVIDER_KIND ? current.name : "Ollama",
      model:
        current.model.trim() && current.kind === OLLAMA_PROVIDER_KIND
          ? current.model
          : OLLAMA_PROVIDER_DRAFT.model,
    }));
  }

  function applyLlamaCppPreset() {
    setProviderDraft((current) => ({
      ...current,
      ...LLAMA_CPP_PROVIDER_DRAFT,
      name:
        current.name.trim() && current.kind === LLAMA_CPP_PROVIDER_KIND
          ? current.name
          : LLAMA_CPP_PROVIDER_DRAFT.name,
      model:
        current.model.trim() && current.kind === LLAMA_CPP_PROVIDER_KIND
          ? current.model
          : LLAMA_CPP_PROVIDER_DRAFT.model,
    }));
  }

  return {
    applyOpenAIPreset,
    applyAnthropicPreset,
    applyOllamaPreset,
    applyLlamaCppPreset,
  };
}
