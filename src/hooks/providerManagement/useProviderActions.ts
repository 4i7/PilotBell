import { type Dispatch, type SetStateAction, useState } from "react";

import {
  type ProviderConfig,
  type ProviderDraft,
  classifyProviderEndpoint,
  isProviderDraftValid,
  makeProviderId,
  normalizeProviderDraft,
  providerRequiresApiKey,
} from "../../domain/provider";
import {
  deleteProviderSecret,
  diagnoseProviderSecret,
  storeProviderSecret,
  testProviderConnection,
} from "../../lib/providerCommands";
import { DEFAULT_PROVIDER_DRAFT } from "../../lib/providerDrafts";
import type { ProviderHealthRecord } from "../../lib/providerHealthStore";
import { saveProviders } from "../../lib/providerStore";
import type { SetProviderStatus, UseProviderManagementOptions } from "./types";

type UseProviderActionsOptions = Pick<
  UseProviderManagementOptions,
  "browserPreviewMessage" | "isTauriRuntime" | "openProviderSettings" | "toneForProviderError"
> & {
  editingProvider: ProviderConfig | null;
  editingProviderId: string;
  isMigratingProviders: boolean;
  providerDraft: ProviderDraft;
  providers: ProviderConfig[];
  selectedProvider: ProviderConfig | null;
  selectedProviderId: string;
  removeProviderHealthRecord: (providerId: string) => void;
  setEditingProviderId: Dispatch<SetStateAction<string>>;
  setProviderDraft: Dispatch<SetStateAction<ProviderDraft>>;
  setProviders: Dispatch<SetStateAction<ProviderConfig[]>>;
  setProviderStatus: SetProviderStatus;
  setSelectedProviderId: Dispatch<SetStateAction<string>>;
  updateProviderHealthRecord: (record: ProviderHealthRecord) => void;
};

export function useProviderActions({
  browserPreviewMessage,
  editingProvider,
  editingProviderId,
  isMigratingProviders,
  isTauriRuntime,
  openProviderSettings,
  providerDraft,
  providers,
  selectedProvider,
  selectedProviderId,
  removeProviderHealthRecord,
  setEditingProviderId,
  setProviderDraft,
  setProviderStatus,
  setProviders,
  setSelectedProviderId,
  toneForProviderError,
  updateProviderHealthRecord,
}: UseProviderActionsOptions) {
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [removingProviderId, setRemovingProviderId] = useState("");
  const isProviderActionsDisabled =
    isMigratingProviders || isSavingProvider || removingProviderId.length > 0;

  function persistProviders(next: ProviderConfig[]) {
    setProviders(next);
    saveProviders(next);
  }

  function resetProviderDraft() {
    setEditingProviderId("");
    setProviderDraft({ ...DEFAULT_PROVIDER_DRAFT });
  }

  function beginEditProvider(provider: ProviderConfig) {
    setSelectedProviderId(provider.id);
    setEditingProviderId(provider.id);
    setProviderDraft({
      kind: provider.kind,
      name: provider.name,
      endpoint: provider.endpoint,
      apiKey: "",
      model: provider.model,
      advancedEndpoint: provider.advancedEndpoint,
    });
    setProviderStatus({
      tone: "neutral",
      message: providerRequiresApiKey(provider.kind)
        ? `Editing ${provider.name}. Leave API key blank to keep the stored secret when the provider type stays the same.`
        : `Editing ${provider.name}. This provider does not use an API key.`,
    });
    openProviderSettings();
  }

  function cancelProviderEdit() {
    resetProviderDraft();
    setProviderStatus({
      tone: "neutral",
      message: "Provider editing cancelled.",
    });
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

  async function removeProvider(id: string) {
    if (!isTauriRuntime) {
      setProviderStatus({
        tone: "warning",
        message: browserPreviewMessage,
      });
      return;
    }

    setRemovingProviderId(id);

    try {
      const result = await deleteProviderSecret(id);
      if (result.status === "error") {
        setProviderStatus({
          tone: toneForProviderError(result.error),
          message: result.error.message,
        });
        return;
      }

      const next = providers.filter((provider) => provider.id !== id);
      persistProviders(next);
      removeProviderHealthRecord(id);
      if (selectedProviderId === id) {
        setSelectedProviderId("");
      }
      if (editingProviderId === id) {
        resetProviderDraft();
      }
      setProviderStatus({
        tone: "neutral",
        message: "Provider metadata and stored secret were removed.",
      });
    } catch (err) {
      setProviderStatus({
        tone: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRemovingProviderId("");
    }
  }

  async function diagnoseSelectedProviderSecret() {
    if (!selectedProvider || !providerRequiresApiKey(selectedProvider.kind)) {
      setProviderStatus({
        tone: "neutral",
        message: "Selected provider does not use a stored secret.",
      });
      return;
    }

    const result = await diagnoseProviderSecret(selectedProvider.id);
    if (result.status === "error") {
      setProviderStatus({
        tone: toneForProviderError(result.error),
        message: result.error.message,
      });
      return;
    }

    setProviderStatus({
      tone: result.data.hasSecret ? "success" : "warning",
      message: result.data.message,
    });
  }

  async function repairSelectedProviderSecretMetadata() {
    if (!selectedProvider || !providerRequiresApiKey(selectedProvider.kind)) {
      return;
    }

    const result = await diagnoseProviderSecret(selectedProvider.id);
    if (result.status === "error") {
      setProviderStatus({
        tone: toneForProviderError(result.error),
        message: result.error.message,
      });
      return;
    }

    const next = providers.map((provider) =>
      provider.id === selectedProvider.id
        ? { ...provider, hasSecret: result.data.hasSecret }
        : provider,
    );
    persistProviders(next);
    removeProviderHealthRecord(selectedProvider.id);
    setProviderStatus({
      tone: result.data.hasSecret ? "success" : "warning",
      message: result.data.hasSecret
        ? "Provider metadata repaired: stored secret is present."
        : "Provider metadata repaired: stored secret is missing. Re-save the API key.",
    });
  }

  async function deleteSelectedProviderSecretOnly() {
    if (!selectedProvider || !providerRequiresApiKey(selectedProvider.kind)) {
      return;
    }

    const result = await deleteProviderSecret(selectedProvider.id);
    if (result.status === "error") {
      setProviderStatus({
        tone: toneForProviderError(result.error),
        message: result.error.message,
      });
      return;
    }

    const next = providers.map((provider) =>
      provider.id === selectedProvider.id ? { ...provider, hasSecret: false } : provider,
    );
    persistProviders(next);
    removeProviderHealthRecord(selectedProvider.id);
    setProviderStatus({
      tone: "warning",
      message: "Stored secret deleted. Re-save the API key before testing this provider.",
    });
  }

  async function testProvider() {
    if (!isTauriRuntime) {
      setProviderStatus({
        tone: "warning",
        message: browserPreviewMessage,
      });
      return;
    }

    if (!selectedProvider) {
      setProviderStatus({
        tone: "warning",
        message: "Select a provider before testing.",
      });
      return;
    }

    setIsTestingProvider(true);
    setProviderStatus({
      tone: "neutral",
      message: `Testing ${selectedProvider.name}...`,
    });

    try {
      const startedAt = performance.now();
      const result = await testProviderConnection(selectedProvider);
      const latencyMs = Math.round(performance.now() - startedAt);
      const checkedAt = new Date().toISOString();

      if (result.status === "success") {
        updateProviderHealthRecord({
          providerId: selectedProvider.id,
          readiness: "ready",
          checkedAt,
          latencyMs,
          message: result.data.message,
        });
        setProviderStatus({
          tone: "success",
          message: `${result.data.message} (${latencyMs} ms)`,
        });
      } else {
        updateProviderHealthRecord({
          providerId: selectedProvider.id,
          readiness: result.error.retryable ? "warning" : "error",
          checkedAt,
          latencyMs,
          message: result.error.message,
          errorKind: result.error.kind,
          statusCode: result.error.statusCode ?? undefined,
          retryable: result.error.retryable,
        });
        setProviderStatus({
          tone: toneForProviderError(result.error),
          message: result.error.message,
        });
      }
    } catch (err) {
      setProviderStatus({
        tone: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTestingProvider(false);
    }
  }

  return {
    isProviderActionsDisabled,
    isSavingProvider,
    isTestingProvider,
    removingProviderId,
    addProvider,
    beginEditProvider,
    cancelProviderEdit,
    deleteSelectedProviderSecretOnly,
    diagnoseSelectedProviderSecret,
    removeProvider,
    repairSelectedProviderSecretMetadata,
    testProvider,
    updateProvider,
  };
}
