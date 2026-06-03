import { useMemo, useState } from "react";

import {
  type ProviderConfig,
  type ProviderDraft,
  classifyProviderEndpoint,
  providerRequiresApiKey,
} from "../domain/provider";
import { DEFAULT_PROVIDER_DRAFT } from "../lib/providerDrafts";
import { loadProviderState } from "../lib/providerStore";
import { createProviderPresetActions } from "./providerManagement/providerPresetActions";
import type {
  ProviderStatus,
  UseProviderManagementOptions,
} from "./providerManagement/types";
import { useProviderActions } from "./providerManagement/useProviderActions";
import { useLegacyProviderMigration } from "./providerManagement/useLegacyProviderMigration";
import { useProviderHealthRecords } from "./providerManagement/useProviderHealthRecords";
import { useProviderSelection } from "./providerManagement/useProviderSelection";

export function useProviderManagement({
  browserPreviewMessage,
  isTauriRuntime,
  openProviderSettings,
  onLegacySecretsScrubbed,
  toneForProviderError,
}: UseProviderManagementOptions) {
  const [initialProviderState] = useState(() => loadProviderState());
  const [isMigratingProviders, setIsMigratingProviders] = useState(
    initialProviderState.legacyProviders.length > 0,
  );
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>(initialProviderState.providers);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>({
    ...DEFAULT_PROVIDER_DRAFT,
  });

  const { providerHealthRecords, updateProviderHealthRecord, removeProviderHealthRecord } =
    useProviderHealthRecords();
  const {
    selectedProvider,
    selectedProviderId,
    setSelectedProviderId,
    editingProvider,
    editingProviderId,
    setEditingProviderId,
  } = useProviderSelection(providers);
  const selectedProviderHealth = selectedProvider
    ? providerHealthRecords[selectedProvider.id] ?? null
    : null;
  const providerDraftRequiresApiKey = providerRequiresApiKey(providerDraft.kind);
  const hasReadyProvider = useMemo(
    () =>
      providers.some((provider) => providerHealthRecords[provider.id]?.readiness === "ready"),
    [providerHealthRecords, providers],
  );
  const providerEndpointRisk = classifyProviderEndpoint(providerDraft.kind, providerDraft.endpoint);

  useLegacyProviderMigration({
    browserPreviewMessage,
    isTauriRuntime,
    legacyProviders: initialProviderState.legacyProviders,
    onLegacySecretsScrubbed,
    setIsMigratingProviders,
    setProviderStatus,
    setProviders,
    toneForProviderError,
  });

  const { applyOpenAIPreset, applyAnthropicPreset, applyOllamaPreset, applyLlamaCppPreset } =
    createProviderPresetActions(setProviderDraft);

  const {
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
  } = useProviderActions({
    browserPreviewMessage,
    editingProvider,
    editingProviderId,
    isMigratingProviders,
    isTauriRuntime,
    openProviderSettings,
    providerDraft,
    providers,
    removeProviderHealthRecord,
    selectedProvider,
    selectedProviderId,
    setEditingProviderId,
    setProviderDraft,
    setProviderStatus,
    setProviders,
    setSelectedProviderId,
    toneForProviderError,
    updateProviderHealthRecord,
  });

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
