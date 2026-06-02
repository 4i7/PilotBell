import type { ProviderActionContext } from "./providerActionContext";
import { useProviderDraftActions } from "./useProviderDraftActions";
import { useProviderRemovalAction } from "./useProviderRemovalAction";
import { useProviderSaveActions } from "./useProviderSaveActions";
import { useProviderSecretActions } from "./useProviderSecretActions";
import { useProviderTestAction } from "./useProviderTestAction";

export function useProviderActions(options: ProviderActionContext) {
  const { beginEditProvider, cancelProviderEdit, resetProviderDraft } =
    useProviderDraftActions(options);
  const { addProvider, isSavingProvider, updateProvider } = useProviderSaveActions({
    ...options,
    resetProviderDraft,
  });
  const { removeProvider, removingProviderId } = useProviderRemovalAction({
    ...options,
    resetProviderDraft,
  });
  const {
    deleteSelectedProviderSecretOnly,
    diagnoseSelectedProviderSecret,
    repairSelectedProviderSecretMetadata,
  } = useProviderSecretActions(options);
  const { isTestingProvider, testProvider } = useProviderTestAction(options);
  const isProviderActionsDisabled =
    options.isMigratingProviders || isSavingProvider || removingProviderId.length > 0;

  return {
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
  };
}
