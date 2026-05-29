import type { ComponentType, Dispatch, RefObject, SetStateAction, SVGProps } from "react";
import type { ProviderConfig } from "../domain/provider";
import type { ProviderHealthRecord, ProviderReadiness } from "../lib/providerHealthStore";

type ProviderSelectorProps = {
  selectedProvider: ProviderConfig | null;
  selectedProviderId: string;
  providers: ProviderConfig[];
  providerHealthRecords: Record<string, ProviderHealthRecord>;
  providerMenuOpen: boolean;
  providerMenuRef: RefObject<HTMLDivElement | null>;
  isDisabled?: boolean;
  selectedProviderLabel: string;
  readinessLabel: (readiness: ProviderReadiness) => string;
  setProviderMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedProviderId: (providerId: string) => void;
  openProviderSettings: () => void;
  ChevronDownIcon: ComponentType<SVGProps<SVGSVGElement>>;
};

export function ProviderSelector({
  selectedProvider,
  selectedProviderId,
  providers,
  providerHealthRecords,
  providerMenuOpen,
  providerMenuRef,
  isDisabled = false,
  selectedProviderLabel,
  readinessLabel,
  setProviderMenuOpen,
  setSelectedProviderId,
  openProviderSettings,
  ChevronDownIcon,
}: ProviderSelectorProps) {
  return (
    <div className="provider-switcher" ref={providerMenuRef}>
      <button
        type="button"
        className="provider-switcher-button"
        onClick={() => setProviderMenuOpen((current) => !current)}
        disabled={isDisabled}
      >
        <span>{selectedProviderLabel}</span>
        <ChevronDownIcon />
      </button>
      {providerMenuOpen ? (
        <div className="provider-menu">
          {providers.length > 0 ? (
            providers.map((provider) => {
              const readiness = providerHealthRecords[provider.id]?.readiness ?? "unknown";
              return (
                <button
                  key={provider.id}
                  type="button"
                  className={
                    provider.id === selectedProviderId
                      ? "provider-menu-item active"
                      : "provider-menu-item"
                  }
                  onClick={() => {
                    setSelectedProviderId(provider.id);
                    setProviderMenuOpen(false);
                  }}
                >
                  <div>
                    <strong>{provider.model || "model not set"}</strong>
                    <span>{provider.name}</span>
                  </div>
                  <span className={`readiness readiness-${readiness}`}>
                    {readinessLabel(readiness)}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="provider-menu-empty">No providers saved yet.</div>
          )}
          <div className="provider-menu-divider" />
          <button
            type="button"
            className="provider-menu-item settings-item"
            onClick={openProviderSettings}
          >
            {selectedProvider ? "Provider settings..." : "Add provider..."}
          </button>
        </div>
      ) : null}
    </div>
  );
}
