import type { Dispatch, SetStateAction } from "react";

import type { ProviderCommandError } from "../../lib/providerCommands";

export type ProviderStatusTone = "neutral" | "success" | "warning" | "error";

export type ProviderStatus = {
  tone: ProviderStatusTone;
  message: string;
};

export type SetProviderStatus = Dispatch<SetStateAction<ProviderStatus | null>>;

export type UseProviderManagementOptions = {
  browserPreviewMessage: string;
  isTauriRuntime: boolean;
  openProviderSettings: () => void;
  toneForProviderError: (error: ProviderCommandError) => ProviderStatusTone;
  onLegacySecretsScrubbed?: () => void;
};
