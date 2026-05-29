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

export type DocumentJobProgress = {
  jobId: string;
  phase: DocumentJobPhase;
  current: number;
  total: number;
  message: string;
};

export type DocumentJobMetadata = {
  jobId: string;
  fileName: string;
  filePath: string;
  outputPath: string;
  timestamp: string;
  status: string;
  selectedTemplate: string;
  providerId?: string | null;
  errorSummary?: string | null;
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
  warnings: string[];
};

export type DocumentJobDraft = {
  inputPath: string;
  outputDir: string;
  selectedTemplate: string;
  providerId: string;
  overwrite: boolean;
};

export const DOCUMENT_JOB_PROGRESS_EVENT = "pilotbell://document-job-progress";
export const DEFAULT_DOCUMENT_TEMPLATE = "standard-review";

export function makeDocumentJobId() {
  return `document-${crypto.randomUUID()}`;
}

export function isDocumentJobDraftReady(draft: DocumentJobDraft) {
  return Boolean(draft.inputPath.trim() && draft.outputDir.trim() && draft.selectedTemplate.trim());
}
