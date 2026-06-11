import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import {
  DEFAULT_PROVIDER_KIND,
  type LegacyProviderConfig,
  type ProviderConfig,
} from "../../domain/provider";
import { deleteProviderSecret, storeProviderSecret } from "../../lib/providerCommands";
import {
  replaceLegacyProvidersWithMetadata,
  saveProviders,
} from "../../lib/providerStore";
import type { ProviderStatus, SetProviderStatus, UseProviderManagementOptions } from "./types";

type UseLegacyProviderMigrationOptions = Pick<
  UseProviderManagementOptions,
  | "browserPreviewMessage"
  | "isTauriRuntime"
  | "onLegacySecretsScrubbed"
  | "toneForProviderError"
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
  onLegacySecretsScrubbed,
  setIsMigratingProviders,
  setProviderStatus,
  setProviders,
  toneForProviderError,
}: UseLegacyProviderMigrationOptions) {
  const hasRunRef = useRef(false);
  const onScrubbedRef = useRef(onLegacySecretsScrubbed);
  const toneForProviderErrorRef = useRef(toneForProviderError);

  onScrubbedRef.current = onLegacySecretsScrubbed;
  toneForProviderErrorRef.current = toneForProviderError;

  useEffect(() => {
    function scrubLegacyProviders(message: string, tone: ProviderStatus["tone"]) {
      setProviders((current) => replaceLegacyProvidersWithMetadata(legacyProviders, current));
      onScrubbedRef.current?.();
      setProviderStatus({
        tone,
        message,
      });
      setIsMigratingProviders(false);
    }

    if (!isTauriRuntime) {
      if (legacyProviders.length > 0) {
        if (hasRunRef.current) {
          return;
        }
        hasRunRef.current = true;
        scrubLegacyProviders(
          "Legacy browser-stored API keys were removed because secure migration requires the Tauri desktop runtime. Re-save each provider API key from settings.",
          "warning",
        );
        return;
      }
      setProviderStatus((current) => {
        if (current?.tone === "warning" && current.message === browserPreviewMessage) {
          return current;
        }

        return {
          tone: "warning",
          message: browserPreviewMessage,
        };
      });
      setIsMigratingProviders((current) => (current ? false : current));
      return;
    }

    if (legacyProviders.length === 0) {
      return;
    }

    if (hasRunRef.current) {
      return;
    }
    hasRunRef.current = true;

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
            scrubLegacyProviders(
              "Legacy provider migration failed. Browser-stored API keys were removed instead of being left behind. Resolve credential-store access, then re-save each provider API key.",
              toneForProviderErrorRef.current(result.error),
            );
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
        // A provider id can exist in both metadata and legacy form in the
        // stored list; the freshly migrated record supersedes it.
        const migratedIds = new Set(migratedProviders.map((provider) => provider.id));
        const next = [
          ...current.filter((provider) => !migratedIds.has(provider.id)),
          ...migratedProviders,
        ];
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
      // A cancelled run rolls its secrets back, so let a later effect run
      // (e.g. the StrictMode dev remount) start the migration over.
      hasRunRef.current = false;
    };
  }, [
    browserPreviewMessage,
    isTauriRuntime,
    legacyProviders,
    setIsMigratingProviders,
    setProviderStatus,
    setProviders,
  ]);
}
