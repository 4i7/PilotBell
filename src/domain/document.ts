export type DocumentJobPhase =
  | "queued"
  | "reading"
  | "parsing_pdf"
  | "parsing_excel"
  | "validating"
  | "generating_markdown"
  | "generating_svg"
  | "generating_docx"
  | "writing_output"
  | "completed"
  | "failed";

export type DocumentFailureKind =
  | "cancelled"
  | "unsupported_input"
  | "input_path"
  | "output_path"
  | "output_exists"
  | "size_limit"
  | "parse_failure"
  | "unknown";

export type DocumentJobProgress = {
  jobId: string;
  phase: DocumentJobPhase;
  current: number;
  total: number;
  message: string;
  warnings?: string[];
};

export type DocumentJobMetadata = {
  jobId: string;
  fileName: string;
  filePath?: string | null;
  outputPath?: string | null;
  timestamp: string;
  status: string;
  selectedTemplate: string;
  providerId?: string | null;
  errorSummary?: string | null;
  warnings?: string[];
  failureKind?: DocumentFailureKind | null;
};

export type DocumentWorkflowRequest = {
  jobId: string;
  inputPath: string;
  outputDir: string;
  selectedTemplate: string;
  providerId?: string | null;
  overwrite: boolean;
};

export type DocumentWorkflowResult = {
  metadata: DocumentJobMetadata;
  markdownPath: string;
  svgPath: string;
  docxPath: string;
  markdownContent: string;
  warnings: string[];
};

export type DocumentJobDraft = {
  inputPath: string;
  outputDir: string;
  selectedTemplate: string;
  overwrite: boolean;
};

export type ReviewableDocumentJob = {
  jobId: string;
  fileName: string;
  selectedTemplate: string;
  markdownContent: string;
};

export const DOCUMENT_JOB_PROGRESS_EVENT = "pilotbell://document-job-progress";
export type DocumentTemplateId =
  | "summary-report"
  | "detailed-analysis"
  | "data-quality-review";

export type DocumentTemplateOption = {
  id: DocumentTemplateId;
  label: string;
  description: string;
  highlights: string;
};

export const DOCUMENT_TEMPLATE_OPTIONS: DocumentTemplateOption[] = [
  {
    id: "summary-report",
    label: "Summary report",
    description: "Short review for quick handoff and top-level status checks.",
    highlights: "Lead with source details, high-signal findings, and a compact preview excerpt.",
  },
  {
    id: "detailed-analysis",
    label: "Detailed analysis",
    description: "Longer report for close reading of extracted facts and review notes.",
    highlights: "Expands document profile, validation walkthrough, and preview evidence.",
  },
  {
    id: "data-quality-review",
    label: "Data-quality review",
    description: "Review format centered on validation, gaps, and follow-up actions.",
    highlights: "Focuses on checks reviewed, warnings, and recommended next steps.",
  },
];

const LEGACY_DOCUMENT_TEMPLATE_ALIASES: Record<string, DocumentTemplateId> = {
  "standard-review": "summary-report",
  "validation-summary": "data-quality-review",
  "executive-brief": "summary-report",
};

export const DEFAULT_DOCUMENT_TEMPLATE: DocumentTemplateId = "summary-report";

export function makeDocumentJobId() {
  return `document-${crypto.randomUUID()}`;
}

export function normalizeDocumentTemplateId(value: string): string {
  const trimmed = value.trim();
  if (trimmed in LEGACY_DOCUMENT_TEMPLATE_ALIASES) {
    return LEGACY_DOCUMENT_TEMPLATE_ALIASES[trimmed] ?? DEFAULT_DOCUMENT_TEMPLATE;
  }

  const option = DOCUMENT_TEMPLATE_OPTIONS.find((item) => item.id === trimmed);
  return option?.id ?? trimmed;
}

export function getDocumentTemplateOption(value: string) {
  const normalized = normalizeDocumentTemplateId(value);
  return DOCUMENT_TEMPLATE_OPTIONS.find((option) => option.id === normalized) ?? null;
}

export function getDocumentTemplateLabel(value: string) {
  return getDocumentTemplateOption(value)?.label ?? value;
}

export function isDocumentJobDraftReady(draft: DocumentJobDraft) {
  return Boolean(draft.inputPath.trim() && draft.outputDir.trim() && draft.selectedTemplate.trim());
}

export function classifyDocumentFailure(errorSummary: string): DocumentFailureKind {
  const normalized = errorSummary.toLowerCase();

  if (normalized.includes("cancelled")) {
    return "cancelled";
  }
  if (normalized.includes("supported document workflow inputs")) {
    return "unsupported_input";
  }
  if (
    normalized.includes("canonicalize input file path") ||
    normalized.includes("selected input path is not a file")
  ) {
    return "input_path";
  }
  if (
    normalized.includes("canonicalize output directory") ||
    normalized.includes("selected output path is not a directory")
  ) {
    return "output_path";
  }
  if (normalized.includes("output already exists") || normalized.includes("confirm overwrite")) {
    return "output_exists";
  }
  if (
    normalized.includes("exceeds the") &&
    (normalized.includes("limit") || normalized.includes("page") || normalized.includes("row"))
  ) {
    return "size_limit";
  }
  if (
    normalized.includes("failed to parse pdf") ||
    normalized.includes("failed to open excel workbook") ||
    normalized.includes("failed to read sheet")
  ) {
    return "parse_failure";
  }

  return "unknown";
}

export function documentFailureGuidance(kind: DocumentFailureKind) {
  switch (kind) {
    case "cancelled":
      return "Start the workflow again when you are ready to regenerate outputs.";
    case "unsupported_input":
      return "Use a PDF or Excel workbook input. Other formats are not accepted in this workflow.";
    case "input_path":
      return "Pick a file that still exists locally and make sure PilotBell can read it.";
    case "output_path":
      return "Choose an existing output folder instead of a file path or missing directory.";
    case "output_exists":
      return "Enable overwrite only if replacing the existing Markdown, SVG, and DOCX outputs is intended.";
    case "size_limit":
      return "Reduce the document size or page/sheet count before retrying this workflow.";
    case "parse_failure":
      return "Try a simpler export of the source file. Some PDFs and workbooks cannot be parsed reliably.";
    case "unknown":
      return "Review the error details, then retry with a simpler path or input if needed.";
  }
}
