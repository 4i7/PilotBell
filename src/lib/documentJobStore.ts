import type { DocumentJobMetadata } from "../domain/document";

const STORAGE_KEY = "pilotbell.documentJobs";
const MAX_DOCUMENT_JOBS = 30;

function normalizeDocumentJobMetadata(value: unknown): DocumentJobMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  if (
    typeof item.jobId !== "string" ||
    typeof item.fileName !== "string" ||
    typeof item.filePath !== "string" ||
    typeof item.outputPath !== "string" ||
    typeof item.timestamp !== "string" ||
    typeof item.status !== "string" ||
    typeof item.selectedTemplate !== "string"
  ) {
    return null;
  }

  return {
    jobId: item.jobId,
    fileName: item.fileName,
    filePath: item.filePath,
    outputPath: item.outputPath,
    timestamp: item.timestamp,
    status: item.status,
    selectedTemplate: item.selectedTemplate,
    providerId: typeof item.providerId === "string" ? item.providerId : null,
    errorSummary: typeof item.errorSummary === "string" ? item.errorSummary : null,
  };
}

export function loadDocumentJobs(): DocumentJobMetadata[] {
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
      .map(normalizeDocumentJobMetadata)
      .filter((job): job is DocumentJobMetadata => job !== null)
      .slice(0, MAX_DOCUMENT_JOBS);
  } catch {
    return [];
  }
}

export function saveDocumentJobs(jobs: DocumentJobMetadata[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, MAX_DOCUMENT_JOBS)));
}

export function clearDeprecatedLocalSourceIndex() {
  localStorage.removeItem("pilotbell.localSourceIndex");
}
