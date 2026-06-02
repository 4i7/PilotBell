import { useEffect, useMemo, useState } from "react";

import type { ProviderConfig } from "../../domain/provider";

export function useProviderSelection(providers: ProviderConfig[]) {
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [editingProviderId, setEditingProviderId] = useState("");

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );
  const editingProvider = useMemo(
    () => providers.find((provider) => provider.id === editingProviderId) ?? null,
    [providers, editingProviderId],
  );

  useEffect(() => {
    if (!selectedProviderId && providers.length > 0) {
      setSelectedProviderId(providers[0].id);
      return;
    }

    if (
      selectedProviderId &&
      providers.length > 0 &&
      !providers.some((provider) => provider.id === selectedProviderId)
    ) {
      setSelectedProviderId(providers[0].id);
    }
  }, [providers, selectedProviderId]);

  return {
    selectedProvider,
    selectedProviderId,
    setSelectedProviderId,
    editingProvider,
    editingProviderId,
    setEditingProviderId,
  };
}
