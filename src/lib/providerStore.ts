import type { LegacyProviderConfig, ProviderConfig } from "../domain/provider";

const STORAGE_KEY = "pilotbell.providers";

type LoadedProviderState = {
  providers: ProviderConfig[];
  legacyProviders: LegacyProviderConfig[];
};

function isProviderMetadata(value: unknown): value is ProviderConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.endpoint === "string" &&
    typeof item.model === "string" &&
    typeof item.hasSecret === "boolean"
  );
}

function isLegacyProvider(value: unknown): value is LegacyProviderConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.endpoint === "string" &&
    typeof item.model === "string" &&
    typeof item.apiKey === "string"
  );
}

export function loadProviderState(): LoadedProviderState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      providers: [],
      legacyProviders: [],
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        providers: [],
        legacyProviders: [],
      };
    }

    return {
      providers: parsed.filter(isProviderMetadata),
      legacyProviders: parsed.filter(isLegacyProvider),
    };
  } catch {
    return {
      providers: [],
      legacyProviders: [],
    };
  }
}

export function saveProviders(providers: ProviderConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
}
