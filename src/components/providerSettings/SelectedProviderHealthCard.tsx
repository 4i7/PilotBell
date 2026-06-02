import { getProviderCapabilities, providerRequiresApiKey, type ProviderConfig } from "../../domain/provider";
import type { ProviderHealthRecord, ProviderReadiness } from "../../lib/providerHealthStore";

type SelectedProviderHealthCardProps = {
  selectedProvider: ProviderConfig | null;
  selectedProviderHealth: ProviderHealthRecord | null;
  isProviderActionsDisabled: boolean;
  isTauriRuntime: boolean;
  isTestingProvider: boolean;
  formatRelativeTime: (value: string) => string;
  readinessLabel: (readiness: ProviderReadiness) => string;
  beginEditProvider: (provider: ProviderConfig) => void;
  testProvider: () => void;
  diagnoseSelectedProviderSecret: () => void;
  repairSelectedProviderSecretMetadata: () => void;
  deleteSelectedProviderSecretOnly: () => void;
};

export function SelectedProviderHealthCard({
  selectedProvider,
  selectedProviderHealth,
  isProviderActionsDisabled,
  isTauriRuntime,
  isTestingProvider,
  formatRelativeTime,
  readinessLabel,
  beginEditProvider,
  testProvider,
  diagnoseSelectedProviderSecret,
  repairSelectedProviderSecretMetadata,
  deleteSelectedProviderSecretOnly,
}: SelectedProviderHealthCardProps) {
  if (!selectedProvider) {
    return null;
  }

  return (
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
            !isTauriRuntime || isProviderActionsDisabled || isTestingProvider || !selectedProvider
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
  );
}
