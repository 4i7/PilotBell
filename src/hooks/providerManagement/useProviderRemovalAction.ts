import { useState } from "react";

import { deleteProviderSecret } from "../../lib/providerCommands";
import { saveProviders } from "../../lib/providerStore";
import type { ProviderActionContext } from "./providerActionContext";

type UseProviderRemovalActionOptions = Pick<
  ProviderActionContext,
  | "browserPreviewMessage"
  | "editingProviderId"
  | "isTauriRuntime"
  | "providers"
  | "removeProviderHealthRecord"
  | "selectedProviderId"
  | "setProviderStatus"
  | "setProviders"
  | "setSelectedProviderId"
  | "toneForProviderError"
> & {
  resetProviderDraft: () => void;
};

export function useProviderRemovalAction({
  browserPreviewMessage,
  editingProviderId,
  isTauriRuntime,
  providers,
  removeProviderHealthRecord,
  resetProviderDraft,
  selectedProviderId,
  setProviderStatus,
  setProviders,
  setSelectedProviderId,
  toneForProviderError,
}: UseProviderRemovalActionOptions) {
  const [removingProviderId, setRemovingProviderId] = useState("");

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
      setProviders(next);
      saveProviders(next);
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

  return {
    removeProvider,
    removingProviderId,
  };
}
