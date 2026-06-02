import { useEffect, type Dispatch, type SetStateAction } from "react";

import {
  DEFAULT_PROVIDER_KIND,
  type LegacyProviderConfig,
  type ProviderConfig,
} from "../../domain/provider";
import { deleteProviderSecret, storeProviderSecret } from "../../lib/providerCommands";
import { saveProviders } from "../../lib/providerStore";
import type { ProviderStatus, SetProviderStatus, UseProviderManagementOptions } from "./types";

type UseLegacyProviderMigrationOptions = Pick<
  UseProviderManagementOptions,
  "browserPreviewMessage" | "isTauriRuntime" | "toneForProviderError"
> & {
  legacyProviders: LegacyProviderConfig[];
  setIsMigratingProviders: Dispatch<SetStateAction<boolean>>;
  setProviderStatus: SetProviderStatus;
  setProviders: Dispatch<SetStateAction<ProviderConfig[]>>;
};

async function rollbackSecrets(providerIds: string[]) {
  await Promise.allSettled(providerIds.map((providerId) => deleteProviderSecret(providerId)));
}

function migrationStatus(legacyProviders: LegacyProviderConfig[]): ProviderStatus {
  return {
    tone: "neutral",
    message: `Migrating ${legacyProviders.length} existing provider secret(s) into the OS credential store...`,
  };
}

export function useLegacyProviderMigration({
  browserPreviewMessage,
  isTauriRuntime,
  legacyProviders,
  setIsMigratingProviders,
  setProviderStatus,
  setProviders,
  toneForProviderError,
}: UseLegacyProviderMigrationOptions) {
  useEffect(() => {
    if (!isTauriRuntime) {
      setProviderStatus({
        tone: "warning",
        message: browserPreviewMessage,
      });
      setIsMigratingProviders(false);
      return;
    }

    if (legacyProviders.length === 0) {
      return;
    }

    let cancelled = false;

    async function migrateLegacyProviders() {
      setProviderStatus(migrationStatus(legacyProviders));

      const migratedProviders: ProviderConfig[] = [];
      const storedProviderIds: string[] = [];

      for (const provider of legacyProviders) {
        const result = await storeProviderSecret(provider.id, provider.apiKey);
        if (result.status === "error") {
          await rollbackSecrets(storedProviderIds);
          if (!cancelled) {
            setProviderStatus({
              tone: toneForProviderError(result.error),
              message:
                "Legacy provider migration failed. Browser-stored providers were left unchanged. Resolve credential-store access and restart PilotBell.",
            });
            setIsMigratingProviders(false);
          }
          return;
        }

        storedProviderIds.push(provider.id);
        migratedProviders.push({
          id: provider.id,
          kind: provider.kind ?? DEFAULT_PROVIDER_KIND,
          name: provider.name,
          endpoint: provider.endpoint,
          model: provider.model,
          hasSecret: true,
          advancedEndpoint: provider.advancedEndpoint ?? false,
        });
      }

      if (cancelled) {
        await rollbackSecrets(storedProviderIds);
        return;
      }

      setProviders((current) => {
        const next = [...current, ...migratedProviders];
        saveProviders(next);
        return next;
      });
      setProviderStatus({
        tone: "success",
        message: `Migrated ${migratedProviders.length} provider secret(s) into the OS credential store.`,
      });
      setIsMigratingProviders(false);
    }

    void migrateLegacyProviders();

    return () => {
      cancelled = true;
    };
  }, [
    browserPreviewMessage,
    isTauriRuntime,
    legacyProviders,
    setIsMigratingProviders,
    setProviderStatus,
    setProviders,
    toneForProviderError,
  ]);
}
