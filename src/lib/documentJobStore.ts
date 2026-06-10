import {
  normalizeDocumentTemplateId,
  type DocumentFailureKind,
  type DocumentJobMetadata,
} from "../domain/document";

const STORAGE_KEY = "pilotbell.documentJobs";
const MAX_DOCUMENT_JOBS = 30;

type SaveDocumentJobsOptions = {
  privateMode?: boolean;
};

function normalizeDocumentJobMetadata(value: unknown): DocumentJobMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  if (
    typeof item.jobId !== "string" ||
    typeof item.fileName !== "string" ||
    typeof item.timestamp !== "string" ||
    typeof item.status !== "string" ||
    typeof item.selectedTemplate !== "string"
  ) {
    return null;
  }

  return {
    jobId: item.jobId,
    fileName: item.fileName,
    filePath: typeof item.filePath === "string" ? item.filePath : null,
    outputPath: typeof item.outputPath === "string" ? item.outputPath : null,
    timestamp: item.timestamp,
    status: item.status,
    selectedTemplate: normalizeDocumentTemplateId(item.selectedTemplate),
    providerId: typeof item.providerId === "string" ? item.providerId : null,
    errorSummary: typeof item.errorSummary === "string" ? item.errorSummary : null,
    warnings: Array.isArray(item.warnings)
      ? item.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
    failureKind: isDocumentFailureKind(item.failureKind) ? item.failureKind : null,
  };
}

function isDocumentFailureKind(value: unknown): value is DocumentFailureKind {
  return (
    value === "cancelled" ||
    value === "unsupported_input" ||
    value === "input_path" ||
    value === "output_path" ||
    value === "output_exists" ||
    value === "size_limit" ||
    value === "parse_failure" ||
    value === "unknown"
  );
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

function sanitizeJobForPersistence(job: DocumentJobMetadata): DocumentJobMetadata {
  return {
    jobId: job.jobId,
    fileName: job.fileName,
    filePath: null,
    outputPath: null,
    timestamp: job.timestamp,
    status: job.status,
    selectedTemplate: normalizeDocumentTemplateId(job.selectedTemplate),
    providerId: null,
    errorSummary: job.errorSummary ?? null,
    warnings: job.warnings ?? [],
    failureKind: job.failureKind ?? null,
  };
}

export function saveDocumentJobs(
  jobs: DocumentJobMetadata[],
  options: SaveDocumentJobsOptions = {},
) {
  if (options.privateMode) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  const sanitized = jobs
    .slice(0, MAX_DOCUMENT_JOBS)
    .map(sanitizeJobForPersistence);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
}

export function clearDeprecatedLocalSourceIndex() {
  localStorage.removeItem("pilotbell.localSourceIndex");
}
