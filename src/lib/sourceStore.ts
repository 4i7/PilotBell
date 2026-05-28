import {
  DIRECTORY_SOURCE_KIND,
  type LocalSource,
  isLocalSourceKind,
} from "../domain/source";

const STORAGE_KEY = "pilotbell.localSources";

function normalizeLocalSource(value: unknown): LocalSource | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    typeof item.path !== "string"
  ) {
    return null;
  }

  return {
    id: item.id,
    kind: isLocalSourceKind(item.kind) ? item.kind : DIRECTORY_SOURCE_KIND,
    name: item.name,
    path: item.path,
    notes: typeof item.notes === "string" ? item.notes : undefined,
  };
}

export function loadLocalSources(): LocalSource[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeLocalSource)
      .filter((source): source is LocalSource => source !== null);
  } catch {
    return [];
  }
}

export function saveLocalSources(sources: LocalSource[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}
