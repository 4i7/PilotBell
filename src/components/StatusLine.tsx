import type { ProviderConfig } from "../domain/provider";
import type { ProviderHealthRecord, ProviderReadiness } from "../lib/providerHealthStore";

type StatusLineProps = {
  selectedProvider: ProviderConfig | null;
  selectedProviderHealth: ProviderHealthRecord | null;
  readinessLabel: (readiness: ProviderReadiness) => string;
  isTestingProvider: boolean;
  isProviderActionsDisabled: boolean;
  isTauriRuntime: boolean;
  sessionEntryCount: number;
  testProvider: () => void;
  clearSession: () => void;
};

export function StatusLine({
  selectedProvider,
  selectedProviderHealth,
  readinessLabel,
  isTestingProvider,
  isProviderActionsDisabled,
  isTauriRuntime,
  sessionEntryCount,
  testProvider,
  clearSession,
}: StatusLineProps) {
  if (!selectedProvider && sessionEntryCount === 0) {
    return null;
  }

  return (
    <div className="composer-footer">
      <div className="composer-status-line">
        {selectedProvider ? (
          <>
            <span className="status-pill">
              {selectedProvider.name} / {selectedProvider.model || "model not set"}
            </span>
            <span
              className={`readiness readiness-${selectedProviderHealth?.readiness ?? "unknown"}`}
            >
              {readinessLabel(selectedProviderHealth?.readiness ?? "unknown")}
            </span>
          </>
        ) : (
          <span className="status-pill">No provider selected</span>
        )}
      </div>

      <div className="composer-actions">
        {selectedProvider ? (
          <button
            type="button"
            className="ghost-action"
            onClick={testProvider}
            disabled={!isTauriRuntime || isProviderActionsDisabled || isTestingProvider}
          >
            {isTestingProvider ? "Testing..." : "Test API"}
          </button>
        ) : null}
        {sessionEntryCount > 0 ? (
          <button type="button" className="ghost-action" onClick={clearSession}>
            Clear chat
          </button>
        ) : null}
      </div>
    </div>
  );
}
