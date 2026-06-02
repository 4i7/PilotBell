import { getProviderCapabilities, type ProviderKind } from "../../domain/provider";

type ProviderRoutingSummaryProps = {
  providerKind: ProviderKind;
};

export function ProviderRoutingSummary({ providerKind }: ProviderRoutingSummaryProps) {
  return (
    <div className="settings-summary-card">
      <div>
        <h3>Provider routing</h3>
        <p>
          Hosted and local providers live behind the same prompt surface. Settings only stay open
          by default until PilotBell sees a ready provider or a successful run.
        </p>
      </div>
      <div className="capability-list" aria-label="Provider capabilities">
        {getProviderCapabilities(providerKind).map((capability) => (
          <span key={capability.label} className="capability" title={capability.detail}>
            {capability.label}
          </span>
        ))}
      </div>
    </div>
  );
}
