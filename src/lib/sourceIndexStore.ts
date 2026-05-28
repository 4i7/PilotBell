import {
  type IndexedSourceChunk,
  type LocalSourceIndexSnapshot,
} from "../domain/source";

const STORAGE_KEY = "pilotbell.localSourceIndex";

function normalizeIndexedSourceChunk(value: unknown): IndexedSourceChunk | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.sourceId !== "string" ||
    typeof item.sourceName !== "string" ||
    typeof item.path !== "string" ||
    typeof item.snippet !== "string" ||
    typeof item.text !== "string"
  ) {
    return null;
  }

  return {
    id: item.id,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    path: item.path,
    snippet: item.snippet,
    text: item.text,
  };
}

export function loadLocalSourceIndex(): LocalSourceIndexSnapshot | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.builtAt !== "string" ||
      typeof parsed.sourceCount !== "number" ||
      typeof parsed.documentCount !== "number" ||
      typeof parsed.chunkCount !== "number" ||
      !Array.isArray(parsed.chunks)
    ) {
      return null;
    }

    return {
      builtAt: parsed.builtAt,
      sourceCount: parsed.sourceCount,
      documentCount: parsed.documentCount,
      chunkCount: parsed.chunkCount,
      chunks: parsed.chunks
        .map(normalizeIndexedSourceChunk)
        .filter((chunk): chunk is IndexedSourceChunk => chunk !== null),
    };
  } catch {
    return null;
  }
}

export function saveLocalSourceIndex(snapshot: LocalSourceIndexSnapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearLocalSourceIndex() {
  localStorage.removeItem(STORAGE_KEY);
}
