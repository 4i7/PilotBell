import type { ProviderConfig } from "../../domain/provider";
import { providerRequiresApiKey } from "../../domain/provider";
import { DEFAULT_PROVIDER_DRAFT } from "../../lib/providerDrafts";
import type { ProviderActionContext } from "./providerActionContext";

type UseProviderDraftActionsOptions = Pick<
  ProviderActionContext,
  | "openProviderSettings"
  | "setEditingProviderId"
  | "setProviderDraft"
  | "setProviderStatus"
  | "setSelectedProviderId"
>;

export function useProviderDraftActions({
  openProviderSettings,
  setEditingProviderId,
  setProviderDraft,
  setProviderStatus,
  setSelectedProviderId,
}: UseProviderDraftActionsOptions) {
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

  return {
    beginEditProvider,
    cancelProviderEdit,
    resetProviderDraft,
  };
}
