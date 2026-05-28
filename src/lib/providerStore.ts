import {
  DEFAULT_PROVIDER_KIND,
  type LegacyProviderConfig,
  type ProviderConfig,
  isProviderKind,
} from "../domain/provider";

const STORAGE_KEY = "pilotbell.providers";

type LoadedProviderState = {
  providers: ProviderConfig[];
  legacyProviders: LegacyProviderConfig[];
};

function normalizeProviderMetadata(value: unknown): ProviderConfig | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    typeof item.endpoint !== "string" ||
    typeof item.model !== "string" ||
    typeof item.hasSecret !== "boolean"
  ) {
    return null;
  }

  return {
    id: item.id,
    kind: isProviderKind(item.kind) ? item.kind : DEFAULT_PROVIDER_KIND,
    name: item.name,
    endpoint: item.endpoint,
    model: item.model,
    hasSecret: item.hasSecret,
  };
}

function normalizeLegacyProvider(value: unknown): LegacyProviderConfig | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    typeof item.endpoint !== "string" ||
    typeof item.model !== "string" ||
    typeof item.apiKey !== "string"
  ) {
    return null;
  }

  return {
    id: item.id,
    kind: isProviderKind(item.kind) ? item.kind : DEFAULT_PROVIDER_KIND,
    name: item.name,
    endpoint: item.endpoint,
    apiKey: item.apiKey,
    model: item.model,
    hasSecret: typeof item.hasSecret === "boolean" ? item.hasSecret : undefined,
  };
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
      providers: parsed
        .map(normalizeProviderMetadata)
        .filter((provider): provider is ProviderConfig => provider !== null),
      legacyProviders: parsed
        .map(normalizeLegacyProvider)
        .filter((provider): provider is LegacyProviderConfig => provider !== null),
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
