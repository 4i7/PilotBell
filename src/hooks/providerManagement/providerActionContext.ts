import type { Dispatch, SetStateAction } from "react";

import type { ProviderConfig, ProviderDraft } from "../../domain/provider";
import type { ProviderHealthRecord } from "../../lib/providerHealthStore";
import type { SetProviderStatus, UseProviderManagementOptions } from "./types";

export type ProviderActionContext = Pick<
  UseProviderManagementOptions,
  "browserPreviewMessage" | "isTauriRuntime" | "openProviderSettings" | "toneForProviderError"
> & {
  editingProvider: ProviderConfig | null;
  editingProviderId: string;
  isMigratingProviders: boolean;
  providerDraft: ProviderDraft;
  providers: ProviderConfig[];
  selectedProvider: ProviderConfig | null;
  selectedProviderId: string;
  removeProviderHealthRecord: (providerId: string) => void;
  setEditingProviderId: Dispatch<SetStateAction<string>>;
  setProviderDraft: Dispatch<SetStateAction<ProviderDraft>>;
  setProviders: Dispatch<SetStateAction<ProviderConfig[]>>;
  setProviderStatus: SetProviderStatus;
  setSelectedProviderId: Dispatch<SetStateAction<string>>;
  updateProviderHealthRecord: (record: ProviderHealthRecord) => void;
};
