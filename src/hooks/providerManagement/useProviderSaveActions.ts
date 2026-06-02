import { useState } from "react";

import {
  type ProviderConfig,
  classifyProviderEndpoint,
  isProviderDraftValid,
  makeProviderId,
  normalizeProviderDraft,
  providerRequiresApiKey,
} from "../../domain/provider";
import { storeProviderSecret, deleteProviderSecret } from "../../lib/providerCommands";
import { DEFAULT_PROVIDER_DRAFT } from "../../lib/providerDrafts";
import { saveProviders } from "../../lib/providerStore";
import type { ProviderActionContext } from "./providerActionContext";

type UseProviderSaveActionsOptions = Pick<
  ProviderActionContext,
  | "browserPreviewMessage"
  | "editingProvider"
  | "isTauriRuntime"
  | "providerDraft"
  | "providers"
  | "removeProviderHealthRecord"
  | "setProviderDraft"
  | "setProviders"
  | "setProviderStatus"
  | "setSelectedProviderId"
  | "toneForProviderError"
> & {
  resetProviderDraft: () => void;
};

export function useProviderSaveActions({
  browserPreviewMessage,
  editingProvider,
  isTauriRuntime,
  providerDraft,
  providers,
  removeProviderHealthRecord,
  resetProviderDraft,
  setProviderDraft,
  setProviderStatus,
  setProviders,
  setSelectedProviderId,
  toneForProviderError,
}: UseProviderSaveActionsOptions) {
  const [isSavingProvider, setIsSavingProvider] = useState(false);

  function persistProviders(next: ProviderConfig[]) {
    setProviders(next);
    saveProviders(next);
  }

  async function addProvider() {
    if (!isTauriRuntime) {
      setProviderStatus({
        tone: "warning",
        message: browserPreviewMessage,
      });
      return;
    }

    const normalized = normalizeProviderDraft(providerDraft);
    const requiresApiKey = providerRequiresApiKey(normalized.kind);
    const endpointRisk = classifyProviderEndpoint(normalized.kind, normalized.endpoint);
    if (!isProviderDraftValid(normalized, { requireApiKey: requiresApiKey })) {
      setProviderStatus({
        tone: "warning",
        message: requiresApiKey
          ? "Provider registration failed: all fields are required."
          : "Provider registration failed: type, name, endpoint, and model are required.",
      });
      return;
    }

    if (endpointRisk.isAdvanced && !normalized.advancedEndpoint) {
      setProviderStatus({
        tone: "warning",
        message: `${endpointRisk.message} Enable advanced endpoint mode to save this provider.`,
      });
      return;
    }

    const nextProvider: ProviderConfig = {
      id: makeProviderId(),
      kind: normalized.kind,
      name: normalized.name,
      endpoint: normalized.endpoint,
      model: normalized.model,
      hasSecret: requiresApiKey,
      advancedEndpoint: normalized.advancedEndpoint,
    };

    setIsSavingProvider(true);
    setProviderStatus({
      tone: "neutral",
      message: requiresApiKey
        ? `Saving ${nextProvider.name} into the OS credential store...`
        : `Saving ${nextProvider.name} as a local provider...`,
    });

    try {
      if (requiresApiKey) {
        const secretResult = await storeProviderSecret(nextProvider.id, normalized.apiKey);
        if (secretResult.status === "error") {
          setProviderStatus({
            tone: toneForProviderError(secretResult.error),
            message: secretResult.error.message,
          });
          return;
        }
      }

      const next = [...providers, nextProvider];
      persistProviders(next);
      setSelectedProviderId(nextProvider.id);
      setProviderDraft({ ...DEFAULT_PROVIDER_DRAFT });
      setProviderStatus({
        tone: "success",
        message: requiresApiKey
          ? `Saved ${nextProvider.name}. Metadata stays in PilotBell, and the API key now lives in the OS credential store.`
          : `Saved ${nextProvider.name}. Local provider metadata stays in PilotBell; no API key was stored.`,
      });
    } catch (err) {
      setProviderStatus({
        tone: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSavingProvider(false);
    }
  }

  async function updateProvider() {
    if (!isTauriRuntime) {
      setProviderStatus({
        tone: "warning",
        message: browserPreviewMessage,
      });
      return;
    }

    if (!editingProvider) {
      setProviderStatus({
        tone: "warning",
        message: "Select a provider before editing.",
      });
      return;
    }

    const normalized = normalizeProviderDraft(providerDraft);
    const requiresApiKey = providerRequiresApiKey(normalized.kind);
    const endpointRisk = classifyProviderEndpoint(normalized.kind, normalized.endpoint);
    const hostedProviderKindChanged =
      editingProvider.kind !== normalized.kind &&
      providerRequiresApiKey(editingProvider.kind) &&
      requiresApiKey;
    if (!isProviderDraftValid(normalized, { requireApiKey: false })) {
      setProviderStatus({
        tone: "warning",
        message: "Provider update failed: type, name, endpoint, and model are required.",
      });
      return;
    }

    if (requiresApiKey && !editingProvider.hasSecret && !normalized.apiKey) {
      setProviderStatus({
        tone: "warning",
        message: "Provider update failed: API key is required because no stored secret exists.",
      });
      return;
    }

    if (hostedProviderKindChanged && !normalized.apiKey) {
      setProviderStatus({
        tone: "warning",
        message: "Provider update failed: switching hosted provider types requires a new API key.",
      });
      return;
    }

    if (endpointRisk.isAdvanced && !normalized.advancedEndpoint) {
      setProviderStatus({
        tone: "warning",
        message: `${endpointRisk.message} Enable advanced endpoint mode before updating this provider.`,
      });
      return;
    }

    const nextProvider: ProviderConfig = {
      id: editingProvider.id,
      kind: normalized.kind,
      name: normalized.name,
      endpoint: normalized.endpoint,
      model: normalized.model,
      hasSecret: requiresApiKey
        ? hostedProviderKindChanged
          ? Boolean(normalized.apiKey)
          : editingProvider.hasSecret || Boolean(normalized.apiKey)
        : false,
      advancedEndpoint: normalized.advancedEndpoint,
    };

    setIsSavingProvider(true);
    setProviderStatus({
      tone: "neutral",
      message: `Updating ${nextProvider.name}...`,
    });

    try {
      if (requiresApiKey && normalized.apiKey) {
        const secretResult = await storeProviderSecret(nextProvider.id, normalized.apiKey);
        if (secretResult.status === "error") {
          setProviderStatus({
            tone: toneForProviderError(secretResult.error),
            message: secretResult.error.message,
          });
          return;
        }
      }

      if (!requiresApiKey && editingProvider.hasSecret) {
        const deleteResult = await deleteProviderSecret(nextProvider.id);
        if (deleteResult.status === "error") {
          setProviderStatus({
            tone: toneForProviderError(deleteResult.error),
            message: deleteResult.error.message,
          });
          return;
        }
      }

      const next = providers.map((provider) =>
        provider.id === nextProvider.id ? nextProvider : provider,
      );
      persistProviders(next);
      setSelectedProviderId(nextProvider.id);
      removeProviderHealthRecord(nextProvider.id);
      resetProviderDraft();
      setProviderStatus({
        tone: "success",
        message: !requiresApiKey
          ? `Updated ${nextProvider.name}. No API key is required for this provider. Run Test API to refresh readiness.`
          : hostedProviderKindChanged
            ? `Updated ${nextProvider.name} and stored a new API key for the new provider type. Run Test API to refresh readiness.`
            : normalized.apiKey
              ? `Updated ${nextProvider.name} and replaced its stored API key. Run Test API to refresh readiness.`
              : `Updated ${nextProvider.name}. Stored API key was kept. Run Test API to refresh readiness.`,
      });
    } catch (err) {
      setProviderStatus({
        tone: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSavingProvider(false);
    }
  }

  return {
    addProvider,
    isSavingProvider,
    updateProvider,
  };
}
