import { useEffect, useMemo, useState } from "react";

import {
  ANTHROPIC_PROVIDER_KIND,
  DEFAULT_PROVIDER_KIND,
  LLAMA_CPP_PROVIDER_KIND,
  OLLAMA_PROVIDER_KIND,
  type ProviderConfig,
  type ProviderDraft,
  classifyProviderEndpoint,
  isProviderDraftValid,
  makeProviderId,
  normalizeProviderDraft,
  providerRequiresApiKey,
} from "../domain/provider";
import {
  type ProviderCommandError,
  deleteProviderSecret,
  diagnoseProviderSecret,
  storeProviderSecret,
  testProviderConnection,
} from "../lib/providerCommands";
import {
  ANTHROPIC_PROVIDER_DRAFT,
  DEFAULT_PROVIDER_DRAFT,
  LLAMA_CPP_PROVIDER_DRAFT,
  OLLAMA_PROVIDER_DRAFT,
} from "../lib/providerDrafts";
import {
  type ProviderHealthRecord,
  loadProviderHealthRecords,
  saveProviderHealthRecords,
} from "../lib/providerHealthStore";
import { loadProviderState, saveProviders } from "../lib/providerStore";

type ProviderStatusTone = "neutral" | "success" | "warning" | "error";

type ProviderStatus = {
  tone: ProviderStatusTone;
  message: string;
};

type UseProviderManagementOptions = {
  browserPreviewMessage: string;
  isTauriRuntime: boolean;
  openProviderSettings: () => void;
  toneForProviderError: (error: ProviderCommandError) => ProviderStatusTone;
};

export function useProviderManagement({
  browserPreviewMessage,
  isTauriRuntime,
  openProviderSettings,
  toneForProviderError,
}: UseProviderManagementOptions) {
  const [initialProviderState] = useState(() => loadProviderState());
  const [providerHealthRecords, setProviderHealthRecords] = useState<
    Record<string, ProviderHealthRecord>
  >(() => loadProviderHealthRecords());
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [isMigratingProviders, setIsMigratingProviders] = useState(
    initialProviderState.legacyProviders.length > 0,
  );
  const [removingProviderId, setRemovingProviderId] = useState("");
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>(initialProviderState.providers);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [editingProviderId, setEditingProviderId] = useState("");
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>({
    ...DEFAULT_PROVIDER_DRAFT,
  });

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );
  const editingProvider = useMemo(
    () => providers.find((provider) => provider.id === editingProviderId) ?? null,
    [providers, editingProviderId],
  );
  const selectedProviderHealth = selectedProvider
    ? providerHealthRecords[selectedProvider.id] ?? null
    : null;
  const providerDraftRequiresApiKey = providerRequiresApiKey(providerDraft.kind);
  const hasReadyProvider = useMemo(
    () =>
      providers.some((provider) => providerHealthRecords[provider.id]?.readiness === "ready"),
    [providerHealthRecords, providers],
  );
  const isProviderActionsDisabled =
    isMigratingProviders || isSavingProvider || removingProviderId.length > 0;
  const providerEndpointRisk = classifyProviderEndpoint(providerDraft.kind, providerDraft.endpoint);

  function persistProviders(next: ProviderConfig[]) {
    setProviders(next);
    saveProviders(next);
  }

  function updateProviderHealthRecord(record: ProviderHealthRecord) {
    setProviderHealthRecords((current) => {
      const next = {
        ...current,
        [record.providerId]: record,
      };
      saveProviderHealthRecords(next);
      return next;
    });
  }

  function removeProviderHealthRecord(providerId: string) {
    setProviderHealthRecords((current) => {
      const next = { ...current };
      delete next[providerId];
      saveProviderHealthRecords(next);
      return next;
    });
  }

  useEffect(() => {
    if (!selectedProviderId && providers.length > 0) {
      setSelectedProviderId(providers[0].id);
      return;
    }

    if (
      selectedProviderId &&
      providers.length > 0 &&
      !providers.some((provider) => provider.id === selectedProviderId)
    ) {
      setSelectedProviderId(providers[0].id);
    }
  }, [providers, selectedProviderId]);

  useEffect(() => {
    if (!isTauriRuntime) {
      setProviderStatus({
        tone: "warning",
        message: browserPreviewMessage,
      });
      setIsMigratingProviders(false);
      return;
    }

    if (initialProviderState.legacyProviders.length === 0) {
      return;
    }

    let cancelled = false;

    async function rollbackSecrets(providerIds: string[]) {
      await Promise.allSettled(providerIds.map((providerId) => deleteProviderSecret(providerId)));
    }

    async function migrateLegacyProviders() {
      setProviderStatus({
        tone: "neutral",
        message: `Migrating ${initialProviderState.legacyProviders.length} existing provider secret(s) into the OS credential store...`,
      });

      const migratedProviders: ProviderConfig[] = [];
      const storedProviderIds: string[] = [];

      for (const provider of initialProviderState.legacyProviders) {
        const result = await storeProviderSecret(provider.id, provider.apiKey);
        if (result.status === "error") {
          await rollbackSecrets(storedProviderIds);
          if (!cancelled) {
            setProviderStatus({
              tone: toneForProviderError(result.error),
              message:
                "Legacy provider migration failed. Browser-stored providers were left unchanged. Resolve credential-store access and restart PilotBell.",
            });
            setIsMigratingProviders(false);
          }
          return;
        }

        storedProviderIds.push(provider.id);
        migratedProviders.push({
          id: provider.id,
          kind: provider.kind ?? DEFAULT_PROVIDER_KIND,
          name: provider.name,
          endpoint: provider.endpoint,
          model: provider.model,
          hasSecret: true,
          advancedEndpoint: provider.advancedEndpoint ?? false,
        });
      }

      if (cancelled) {
        await rollbackSecrets(storedProviderIds);
        return;
      }

      setProviders((current) => {
        const next = [...current, ...migratedProviders];
        saveProviders(next);
        return next;
      });
      setProviderStatus({
        tone: "success",
        message: `Migrated ${migratedProviders.length} provider secret(s) into the OS credential store.`,
      });
      setIsMigratingProviders(false);
    }

    void migrateLegacyProviders();

    return () => {
      cancelled = true;
    };
  }, [
    browserPreviewMessage,
    initialProviderState.legacyProviders,
    isTauriRuntime,
    toneForProviderError,
  ]);

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
    providers,
    providerDraft,
    setProviderDraft,
    providerDraftRequiresApiKey,
    providerEndpointRisk,
    editingProvider,
    providerHealthRecords,
    selectedProvider,
    selectedProviderHealth,
    selectedProviderId,
    setSelectedProviderId,
    providerStatus,
    setProviderStatus,
    hasReadyProvider,
    isProviderActionsDisabled,
    isSavingProvider,
    isMigratingProviders,
    isTestingProvider,
    removingProviderId,
    applyOpenAIPreset,
    applyAnthropicPreset,
    applyOllamaPreset,
    applyLlamaCppPreset,
    addProvider,
    updateProvider,
    cancelProviderEdit,
    beginEditProvider,
    removeProvider,
    testProvider,
    diagnoseSelectedProviderSecret,
    repairSelectedProviderSecretMetadata,
    deleteSelectedProviderSecretOnly,
  };
}
