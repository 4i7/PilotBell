const STORAGE_KEY = "pilotbell.promptSession";
const MAX_SESSION_ENTRIES = 20;

export type PromptSessionEntry = {
  id: string;
  prompt: string;
  createdAt: string;
  providerId: string;
  providerName: string;
  model: string;
  response?: string;
  error?: string;
};

function normalizeSessionEntry(value: unknown): PromptSessionEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.prompt !== "string" ||
    typeof item.createdAt !== "string" ||
    typeof item.providerId !== "string" ||
    typeof item.providerName !== "string" ||
    typeof item.model !== "string"
  ) {
    return null;
  }

  return {
    id: item.id,
    prompt: item.prompt,
    createdAt: item.createdAt,
    providerId: item.providerId,
    providerName: item.providerName,
    model: item.model,
    response: typeof item.response === "string" ? item.response : undefined,
    error: typeof item.error === "string" ? item.error : undefined,
  };
}

export function loadPromptSession(): PromptSessionEntry[] {
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
      .map(normalizeSessionEntry)
      .filter((entry): entry is PromptSessionEntry => entry !== null)
      .slice(0, MAX_SESSION_ENTRIES);
  } catch {
    return [];
  }
}

export function savePromptSession(entries: PromptSessionEntry[]) {
  // A single oversized response can push the payload over the localStorage
  // quota; history persistence must never break the send flow itself.
  let next = entries.slice(0, MAX_SESSION_ENTRIES);
  while (next.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return;
    } catch {
      next = next.slice(0, Math.floor(next.length / 2));
    }
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is unavailable entirely; keep the session in memory only.
  }
}
