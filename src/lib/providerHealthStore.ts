const STORAGE_KEY = "pilotbell.providerHealth";

export type ProviderReadiness = "unknown" | "ready" | "warning" | "error";

export type ProviderHealthRecord = {
  providerId: string;
  readiness: ProviderReadiness;
  checkedAt: string;
  latencyMs?: number;
  message: string;
  errorKind?: string;
  statusCode?: number;
  retryable?: boolean;
};

function normalizeHealthRecord(value: unknown): ProviderHealthRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  if (
    typeof item.providerId !== "string" ||
    typeof item.readiness !== "string" ||
    typeof item.checkedAt !== "string" ||
    typeof item.message !== "string"
  ) {
    return null;
  }

  if (!["unknown", "ready", "warning", "error"].includes(item.readiness)) {
    return null;
  }

  return {
    providerId: item.providerId,
    readiness: item.readiness as ProviderReadiness,
    checkedAt: item.checkedAt,
    message: item.message,
    latencyMs: typeof item.latencyMs === "number" ? item.latencyMs : undefined,
    errorKind: typeof item.errorKind === "string" ? item.errorKind : undefined,
    statusCode: typeof item.statusCode === "number" ? item.statusCode : undefined,
    retryable: typeof item.retryable === "boolean" ? item.retryable : undefined,
  };
}

export function loadProviderHealthRecords(): Record<string, ProviderHealthRecord> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return {};
    }

    return parsed
      .map(normalizeHealthRecord)
      .filter((record): record is ProviderHealthRecord => record !== null)
      .reduce<Record<string, ProviderHealthRecord>>((records, record) => {
        records[record.providerId] = record;
        return records;
      }, {});
  } catch {
    return {};
  }
}

export function saveProviderHealthRecords(records: Record<string, ProviderHealthRecord>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.values(records)));
}
