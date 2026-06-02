import { providerRequiresApiKey } from "../../domain/provider";
import { deleteProviderSecret, diagnoseProviderSecret } from "../../lib/providerCommands";
import { saveProviders } from "../../lib/providerStore";
import type { ProviderActionContext } from "./providerActionContext";

type UseProviderSecretActionsOptions = Pick<
  ProviderActionContext,
  | "providers"
  | "removeProviderHealthRecord"
  | "selectedProvider"
  | "setProviderStatus"
  | "setProviders"
  | "toneForProviderError"
>;

export function useProviderSecretActions({
  providers,
  removeProviderHealthRecord,
  selectedProvider,
  setProviderStatus,
  setProviders,
  toneForProviderError,
}: UseProviderSecretActionsOptions) {
  function persistProviders(next: typeof providers) {
    setProviders(next);
    saveProviders(next);
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

  return {
    deleteSelectedProviderSecretOnly,
    diagnoseSelectedProviderSecret,
    repairSelectedProviderSecretMetadata,
  };
}
