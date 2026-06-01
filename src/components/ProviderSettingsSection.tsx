import type { Dispatch, SetStateAction } from "react";

import {
  ANTHROPIC_PROVIDER_KIND,
  DEFAULT_PROVIDER_KIND,
  LLAMA_CPP_PROVIDER_KIND,
  OLLAMA_PROVIDER_KIND,
  type ProviderConfig,
  type ProviderDraft,
  type ProviderEndpointRisk,
  type ProviderKind,
  getProviderCapabilities,
  officialEndpointForProvider,
  providerRequiresApiKey,
} from "../domain/provider";
import type { PromptInputPreferences, SubmitShortcutMode } from "../domain/inputPreferences";
import type {
  ProviderHealthRecord,
  ProviderReadiness,
} from "../lib/providerHealthStore";

type StatusTone = "neutral" | "success" | "warning" | "error";

type InlineStatus = {
  tone: StatusTone;
  message: string;
};

type ProviderSettingsSectionProps = {
  inputPreferences: PromptInputPreferences;
  updateInputPreferences: (
    updater: (current: PromptInputPreferences) => PromptInputPreferences,
  ) => void;
  providerDraft: ProviderDraft;
  setProviderDraft: Dispatch<SetStateAction<ProviderDraft>>;
  providerDraftRequiresApiKey: boolean;
  providerEndpointRisk: ProviderEndpointRisk;
  editingProvider: ProviderConfig | null;
  providers: ProviderConfig[];
  providerHealthRecords: Record<string, ProviderHealthRecord>;
  selectedProvider: ProviderConfig | null;
  selectedProviderHealth: ProviderHealthRecord | null;
  selectedProviderId: string;
  providerStatus: InlineStatus | null;
  isProviderActionsDisabled: boolean;
  isTauriRuntime: boolean;
  isSavingProvider: boolean;
  isMigratingProviders: boolean;
  isTestingProvider: boolean;
  removingProviderId: string;
  formatRelativeTime: (value: string) => string;
  readinessLabel: (readiness: ProviderReadiness) => string;
  applyOpenAIPreset: () => void;
  applyAnthropicPreset: () => void;
  applyOllamaPreset: () => void;
  applyLlamaCppPreset: () => void;
  addProvider: () => void;
  updateProvider: () => void;
  cancelProviderEdit: () => void;
  setSelectedProviderId: (providerId: string) => void;
  beginEditProvider: (provider: ProviderConfig) => void;
  removeProvider: (providerId: string) => void;
  testProvider: () => void;
  diagnoseSelectedProviderSecret: () => void;
  repairSelectedProviderSecretMetadata: () => void;
  deleteSelectedProviderSecretOnly: () => void;
};

const PROVIDER_KIND_OPTIONS: Array<{ value: ProviderKind; label: string }> = [
  { value: DEFAULT_PROVIDER_KIND, label: "OpenAI Responses" },
  { value: ANTHROPIC_PROVIDER_KIND, label: "Anthropic Messages" },
  { value: OLLAMA_PROVIDER_KIND, label: "Ollama" },
  { value: LLAMA_CPP_PROVIDER_KIND, label: "llama.cpp" },
];

const SUBMIT_SHORTCUT_OPTIONS: Array<{
  value: SubmitShortcutMode;
  label: string;
}> = [
  { value: "mod-enter", label: "Ctrl/Cmd+Enter" },
  { value: "enter", label: "Enter" },
  { value: "shift-enter", label: "Shift+Enter" },
  { value: "ctrl-enter", label: "Ctrl+Enter" },
  { value: "disabled", label: "Disabled" },
];

function providerKindLabel(kind: ProviderKind) {
  return PROVIDER_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

export function ProviderSettingsSection({
  inputPreferences,
  updateInputPreferences,
  providerDraft,
  setProviderDraft,
  providerDraftRequiresApiKey,
  providerEndpointRisk,
  editingProvider,
  providers,
  providerHealthRecords,
  selectedProvider,
  selectedProviderHealth,
  selectedProviderId,
  providerStatus,
  isProviderActionsDisabled,
  isTauriRuntime,
  isSavingProvider,
  isMigratingProviders,
  isTestingProvider,
  removingProviderId,
  formatRelativeTime,
  readinessLabel,
  applyOpenAIPreset,
  applyAnthropicPreset,
  applyOllamaPreset,
  applyLlamaCppPreset,
  addProvider,
  updateProvider,
  cancelProviderEdit,
  setSelectedProviderId,
  beginEditProvider,
  removeProvider,
  testProvider,
  diagnoseSelectedProviderSecret,
  repairSelectedProviderSecretMetadata,
  deleteSelectedProviderSecretOnly,
}: ProviderSettingsSectionProps) {
  return (
    <div className="settings-section">
      <div className="settings-summary-card">
        <div>
          <h3>Provider routing</h3>
          <p>
            Hosted and local providers live behind the same prompt surface. Settings only stay
            open by default until PilotBell sees a ready provider or a successful run.
          </p>
        </div>
        <div className="capability-list" aria-label="Provider capabilities">
          {getProviderCapabilities(providerDraft.kind).map((capability) => (
            <span key={capability.label} className="capability" title={capability.detail}>
              {capability.label}
            </span>
          ))}
        </div>
      </div>

      <div className="settings-summary-card">
        <div className="section-heading">
          <div>
            <h3>Prompt input</h3>
            <p>Composer behavior stays here so the main surface remains focused on the next prompt.</p>
          </div>
        </div>

        <div className="settings-grid settings-grid-single">
          <select
            value={inputPreferences.submitShortcut}
            onChange={(event) =>
              updateInputPreferences((current) => ({
                ...current,
                submitShortcut: event.currentTarget.value as SubmitShortcutMode,
              }))
            }
          >
            {SUBMIT_SHORTCUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-checkbox-list">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={inputPreferences.clearOnSubmit}
              onChange={(event) =>
                updateInputPreferences((current) => ({
                  ...current,
                  clearOnSubmit: event.currentTarget.checked,
                }))
              }
            />
            Clear prompt after a successful send
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={inputPreferences.focusAfterSubmit}
              onChange={(event) =>
                updateInputPreferences((current) => ({
                  ...current,
                  focusAfterSubmit: event.currentTarget.checked,
                }))
              }
            />
            Return focus to the prompt after submit
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={inputPreferences.allowSubmitWhileSending}
              onChange={(event) =>
                updateInputPreferences((current) => ({
                  ...current,
                  allowSubmitWhileSending: event.currentTarget.checked,
                }))
              }
            />
            Allow a new send while a response is still running
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={inputPreferences.autoResize}
              onChange={(event) =>
                updateInputPreferences((current) => ({
                  ...current,
                  autoResize: event.currentTarget.checked,
                }))
              }
            />
            Auto-resize the prompt field
          </label>
        </div>
      </div>

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

      {providerStatus ? (
        <div className={`notice notice-${providerStatus.tone}`}>{providerStatus.message}</div>
      ) : null}

      {providers.length > 0 ? (
        <ul className="provider-list">
          {providers.map((provider) => {
            const health = providerHealthRecords[provider.id];
            const readiness = health?.readiness ?? "unknown";
            return (
              <li key={provider.id}>
                <button
                  type="button"
                  className={provider.id === selectedProviderId ? "provider active" : "provider"}
                  onClick={() => setSelectedProviderId(provider.id)}
                  disabled={!isTauriRuntime || isProviderActionsDisabled}
                >
                  <span>
                    {provider.name} / {provider.model || "model not set"} /{" "}
                    {providerKindLabel(provider.kind)}
                    {provider.advancedEndpoint ? " / advanced endpoint" : ""}
                  </span>
                  <span className={`readiness readiness-${readiness}`}>
                    {readinessLabel(readiness)}
                  </span>
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => beginEditProvider(provider)}
                  disabled={!isTauriRuntime || isProviderActionsDisabled}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void removeProvider(provider.id)}
                  disabled={!isTauriRuntime || isProviderActionsDisabled}
                >
                  {removingProviderId === provider.id ? "Removing..." : "Remove"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">
          {!isTauriRuntime
            ? "Open PilotBell through Tauri to save and test providers."
            : isMigratingProviders
              ? "Migrating saved providers into the OS credential store..."
              : "Save a provider, select it, then test the API."}
        </p>
      )}

      {selectedProvider ? (
        <div className="provider-health-card">
          <div className="section-heading">
            <div className="section-title">Selected provider readiness</div>
            <span className="status">{selectedProvider.name}</span>
          </div>
          <div className="capability-list">
            {getProviderCapabilities(selectedProvider.kind).map((capability) => (
              <span key={capability.label} className="capability" title={capability.detail}>
                {capability.label}
              </span>
            ))}
          </div>
          {selectedProviderHealth ? (
            <div className="health-detail">
              <span className={`readiness readiness-${selectedProviderHealth.readiness}`}>
                {readinessLabel(selectedProviderHealth.readiness)}
              </span>
              <span>{selectedProviderHealth.message}</span>
              <span className="status">
                Checked {formatRelativeTime(selectedProviderHealth.checkedAt)}
                {selectedProviderHealth.latencyMs
                  ? ` / ${selectedProviderHealth.latencyMs} ms`
                  : ""}
                {selectedProviderHealth.errorKind ? ` / ${selectedProviderHealth.errorKind}` : ""}
                {selectedProviderHealth.statusCode
                  ? ` / HTTP ${selectedProviderHealth.statusCode}`
                  : ""}
                {selectedProviderHealth.retryable ? " / retryable" : ""}
              </span>
            </div>
          ) : (
            <p className="empty">Run Test API to record readiness for this provider.</p>
          )}
          <div className="settings-actions">
            <button
              type="button"
              className="button-test"
              onClick={() => void testProvider()}
              disabled={
                !isTauriRuntime ||
                isProviderActionsDisabled ||
                isTestingProvider ||
                !selectedProvider
              }
            >
              {isTestingProvider ? "Testing..." : "Test API"}
            </button>
            {providerRequiresApiKey(selectedProvider.kind) ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void diagnoseSelectedProviderSecret()}
                  disabled={!isTauriRuntime || isProviderActionsDisabled}
                >
                  Diagnose secret
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => beginEditProvider(selectedProvider)}
                  disabled={!isTauriRuntime || isProviderActionsDisabled}
                >
                  Re-save secret
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void repairSelectedProviderSecretMetadata()}
                  disabled={!isTauriRuntime || isProviderActionsDisabled}
                >
                  Repair provider
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void deleteSelectedProviderSecretOnly()}
                  disabled={!isTauriRuntime || isProviderActionsDisabled}
                >
                  Delete secret
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
