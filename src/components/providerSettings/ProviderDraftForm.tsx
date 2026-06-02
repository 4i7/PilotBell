import type { Dispatch, SetStateAction } from "react";

import {
  officialEndpointForProvider,
  type ProviderConfig,
  type ProviderDraft,
  type ProviderEndpointRisk,
  type ProviderKind,
} from "../../domain/provider";
import { PROVIDER_KIND_OPTIONS } from "./options";

type ProviderDraftFormProps = {
  providerDraft: ProviderDraft;
  setProviderDraft: Dispatch<SetStateAction<ProviderDraft>>;
  providerDraftRequiresApiKey: boolean;
  providerEndpointRisk: ProviderEndpointRisk;
  editingProvider: ProviderConfig | null;
};

export function ProviderDraftForm({
  providerDraft,
  setProviderDraft,
  providerDraftRequiresApiKey,
  providerEndpointRisk,
  editingProvider,
}: ProviderDraftFormProps) {
  return (
    <>
      <div className="settings-grid">
        <select
          value={providerDraft.kind}
          onChange={(event) => {
            const kind = event.currentTarget.value as ProviderKind;
            setProviderDraft({
              ...providerDraft,
              kind,
              endpoint: officialEndpointForProvider(kind),
              advancedEndpoint: false,
            });
          }}
        >
          {PROVIDER_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={providerDraft.name}
          onChange={(event) =>
            setProviderDraft({ ...providerDraft, name: event.currentTarget.value })
          }
          placeholder="Display name"
        />
        <input
          value={providerDraft.model}
          onChange={(event) =>
            setProviderDraft({ ...providerDraft, model: event.currentTarget.value })
          }
          placeholder="Model available to your API key"
        />
        <select
          value=""
          onChange={(event) => {
            const model = event.currentTarget.value;
            if (model) {
              setProviderDraft({ ...providerDraft, model });
            }
          }}
        >
          <option value="">Model presets...</option>
          <option value="gpt-4.1-mini">OpenAI: gpt-4.1-mini</option>
          <option value="gpt-4.1">OpenAI: gpt-4.1</option>
          <option value="claude-sonnet-4-20250514">Anthropic: Claude Sonnet 4</option>
          <option value="llama3.2">Ollama: llama3.2</option>
          <option value="local-llama">llama.cpp: local-llama</option>
        </select>
        <input
          value={providerDraft.endpoint}
          onChange={(event) =>
            setProviderDraft({ ...providerDraft, endpoint: event.currentTarget.value })
          }
          placeholder="Endpoint URL"
        />
        <input
          type="password"
          value={providerDraft.apiKey}
          onChange={(event) =>
            setProviderDraft({ ...providerDraft, apiKey: event.currentTarget.value })
          }
          placeholder={
            providerDraftRequiresApiKey
              ? editingProvider
                ? "New API key (optional)"
                : "API key"
              : "API key not required"
          }
          disabled={!providerDraftRequiresApiKey}
        />
      </div>

      <p className="helper">
        Model availability depends on your provider account. If the provider test fails, choose a
        model available to your API key.
      </p>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={providerDraft.advancedEndpoint}
          onChange={(event) =>
            setProviderDraft({
              ...providerDraft,
              advancedEndpoint: event.currentTarget.checked,
            })
          }
        />
        Advanced endpoint mode
      </label>
      <div className={`notice notice-${providerEndpointRisk.tone}`}>
        {providerEndpointRisk.message}
      </div>
    </>
  );
}
