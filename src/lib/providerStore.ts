import type { ProviderConfig } from "../domain/provider";

const STORAGE_KEY = "pilotbell.providers";

export function loadProviders(): ProviderConfig[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as ProviderConfig[];
    return parsed.filter(
      (item) =>
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.endpoint === "string" &&
        typeof item.apiKey === "string" &&
        typeof item.model === "string",
    );
  } catch {
    return [];
  }
}

export function saveProviders(providers: ProviderConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
}
