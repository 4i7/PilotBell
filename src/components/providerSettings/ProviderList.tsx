import type { ProviderConfig } from "../../domain/provider";
import type { ProviderHealthRecord, ProviderReadiness } from "../../lib/providerHealthStore";
import { providerKindLabel } from "./options";

type ProviderListProps = {
  providers: ProviderConfig[];
  providerHealthRecords: Record<string, ProviderHealthRecord>;
  selectedProviderId: string;
  isProviderActionsDisabled: boolean;
  isTauriRuntime: boolean;
  isMigratingProviders: boolean;
  removingProviderId: string;
  readinessLabel: (readiness: ProviderReadiness) => string;
  setSelectedProviderId: (providerId: string) => void;
  beginEditProvider: (provider: ProviderConfig) => void;
  removeProvider: (providerId: string) => void;
};

export function ProviderList({
  providers,
  providerHealthRecords,
  selectedProviderId,
  isProviderActionsDisabled,
  isTauriRuntime,
  isMigratingProviders,
  removingProviderId,
  readinessLabel,
  setSelectedProviderId,
  beginEditProvider,
  removeProvider,
}: ProviderListProps) {
  if (providers.length === 0) {
    return (
      <p className="empty">
        {!isTauriRuntime
          ? "Open PilotBell through Tauri to save and test providers."
          : isMigratingProviders
            ? "Migrating saved providers into the OS credential store..."
            : "Save a provider, select it, then test the API."}
      </p>
    );
  }

  return (
    <ul className="provider-list">
      {providers.map((provider) => {
        const health = providerHealthRecords[provider.id];
        const readiness: ProviderReadiness = health?.readiness ?? "unknown";
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
  );
}
