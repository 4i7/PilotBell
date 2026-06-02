import type { Dispatch, SetStateAction } from "react";

import type {
  ProviderConfig,
  ProviderDraft,
  ProviderEndpointRisk,
} from "../domain/provider";
import type { PromptInputPreferences } from "../domain/inputPreferences";
import type {
  ProviderHealthRecord,
  ProviderReadiness,
} from "../lib/providerHealthStore";
import { ProviderActions } from "./providerSettings/ProviderActions";
import { ProviderDraftForm } from "./providerSettings/ProviderDraftForm";
import { ProviderList } from "./providerSettings/ProviderList";
import { ProviderRoutingSummary } from "./providerSettings/ProviderRoutingSummary";
import { PromptInputSettings } from "./providerSettings/PromptInputSettings";
import { SelectedProviderHealthCard } from "./providerSettings/SelectedProviderHealthCard";

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
      <ProviderRoutingSummary providerKind={providerDraft.kind} />

      <PromptInputSettings
        inputPreferences={inputPreferences}
        updateInputPreferences={updateInputPreferences}
      />

      <ProviderDraftForm
        providerDraft={providerDraft}
        setProviderDraft={setProviderDraft}
        providerDraftRequiresApiKey={providerDraftRequiresApiKey}
        providerEndpointRisk={providerEndpointRisk}
        editingProvider={editingProvider}
      />

      <ProviderActions
        editingProvider={editingProvider}
        isProviderActionsDisabled={isProviderActionsDisabled}
        isTauriRuntime={isTauriRuntime}
        isSavingProvider={isSavingProvider}
        applyOpenAIPreset={applyOpenAIPreset}
        applyAnthropicPreset={applyAnthropicPreset}
        applyOllamaPreset={applyOllamaPreset}
        applyLlamaCppPreset={applyLlamaCppPreset}
        addProvider={addProvider}
        updateProvider={updateProvider}
        cancelProviderEdit={cancelProviderEdit}
      />

      {providerStatus ? (
        <div className={`notice notice-${providerStatus.tone}`}>{providerStatus.message}</div>
      ) : null}

      <ProviderList
        providers={providers}
        providerHealthRecords={providerHealthRecords}
        selectedProviderId={selectedProviderId}
        isProviderActionsDisabled={isProviderActionsDisabled}
        isTauriRuntime={isTauriRuntime}
        isMigratingProviders={isMigratingProviders}
        removingProviderId={removingProviderId}
        readinessLabel={readinessLabel}
        setSelectedProviderId={setSelectedProviderId}
        beginEditProvider={beginEditProvider}
        removeProvider={removeProvider}
      />

      <SelectedProviderHealthCard
        selectedProvider={selectedProvider}
        selectedProviderHealth={selectedProviderHealth}
        isProviderActionsDisabled={isProviderActionsDisabled}
        isTauriRuntime={isTauriRuntime}
        isTestingProvider={isTestingProvider}
        formatRelativeTime={formatRelativeTime}
        readinessLabel={readinessLabel}
        beginEditProvider={beginEditProvider}
        testProvider={testProvider}
        diagnoseSelectedProviderSecret={diagnoseSelectedProviderSecret}
        repairSelectedProviderSecretMetadata={repairSelectedProviderSecretMetadata}
        deleteSelectedProviderSecretOnly={deleteSelectedProviderSecretOnly}
      />
    </div>
  );
}
