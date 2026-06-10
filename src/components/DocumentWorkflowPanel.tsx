import { open } from "@tauri-apps/plugin-dialog";

import {
  DOCUMENT_TEMPLATE_OPTIONS,
  documentFailureGuidance,
  getDocumentTemplateLabel,
  type DocumentJobDraft,
  type DocumentJobMetadata,
  type DocumentJobProgress,
  type ReviewableDocumentJob,
} from "../domain/document";
import type { PromptContextPreview } from "../domain/prompt";
import type { ProviderConfig } from "../domain/provider";
import { ProgressPanel } from "./ProgressPanel";
import { PromptContextPreviewPanel } from "./PromptContextPreviewPanel";

type DocumentWorkflowPanelProps = {
  draft: DocumentJobDraft;
  setDraft: (draft: DocumentJobDraft) => void;
  jobs: DocumentJobMetadata[];
  reviewableJobs: Record<string, ReviewableDocumentJob>;
  progress: DocumentJobProgress | null;
  statusMessage: string;
  isRunning: boolean;
  selectedProvider: ProviderConfig | null;
  isTauriRuntime: boolean;
  privateMode: boolean;
  setPrivateMode: (value: boolean) => void;
  documentAssistStatus: {
    tone: "neutral" | "success" | "warning" | "error";
    message: string;
  } | null;
  documentAssistReplyError: {
    details?: string | null;
  } | null;
  documentAssistLastResult: {
    content: string;
    providerLabel: string;
    fileName: string;
  } | null;
  pendingDocumentContextPreview: PromptContextPreview | null;
  onOpenProviderSettings: () => void;
  onRequestDocumentAssistReview: (job: ReviewableDocumentJob) => void;
  onApproveDocumentAssistReview: () => void;
  onCancelDocumentAssistReview: () => void;
  onClearDocumentAssistResult: () => void;
  onStart: () => void;
  onCancel: () => void;
  onClear: () => void;
};

export function DocumentWorkflowPanel({
  draft,
  setDraft,
  jobs,
  reviewableJobs,
  progress,
  statusMessage,
  isRunning,
  selectedProvider,
  isTauriRuntime,
  privateMode,
  setPrivateMode,
  documentAssistStatus,
  documentAssistReplyError,
  documentAssistLastResult,
  pendingDocumentContextPreview,
  onOpenProviderSettings,
  onRequestDocumentAssistReview,
  onApproveDocumentAssistReview,
  onCancelDocumentAssistReview,
  onClearDocumentAssistResult,
  onStart,
  onCancel,
  onClear,
}: DocumentWorkflowPanelProps) {
  async function chooseInputFile() {
    if (!isTauriRuntime) {
      return;
    }
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Documents", extensions: ["pdf", "xls", "xlsx", "xlsm", "xlsb", "ods"] },
      ],
    });
    if (typeof selected === "string") {
      setDraft({ ...draft, inputPath: selected });
    }
  }

  async function chooseOutputFolder() {
    if (!isTauriRuntime) {
      return;
    }
    const selected = await open({
      multiple: false,
      directory: true,
    });
    if (typeof selected === "string") {
      setDraft({ ...draft, outputDir: selected });
    }
  }

  const latestJob = jobs[0] ?? null;
  const latestFailure = latestJob?.status === "failed" ? latestJob : null;
  const latestReviewableMetadata =
    jobs.find((job) => job.status === "completed" && reviewableJobs[job.jobId]) ?? null;
  const latestReviewableJob = latestReviewableMetadata
    ? reviewableJobs[latestReviewableMetadata.jobId] ?? null
    : null;

  return (
    <div className="settings-section">
      <div className="settings-summary-card">
        <div>
          <h3>Document workflow</h3>
          <p>
            Analyze a selected PDF or Excel workbook in Rust, then generate reviewable Markdown,
            sanitized SVG, and DOCX outputs. When LLM wording help is used, PilotBell shows the
            provider payload before any document-derived context is sent.
          </p>
        </div>
      </div>

      <div className="notice notice-neutral">
        Local document processing still runs in Rust first. LLM assistance is optional and uses the
        generated Markdown review draft rather than raw persisted document storage.
      </div>

      <div className="notice notice-neutral">
        Persistent document metadata is minimized. PilotBell does not persist input paths, output
        paths, or provider identifiers in browser storage.
      </div>

      <div className="settings-grid">
        <input
          value={draft.inputPath}
          onChange={(event) => setDraft({ ...draft, inputPath: event.currentTarget.value })}
          placeholder="Input PDF or Excel path"
        />
        <button type="button" className="button-preset" onClick={() => void chooseInputFile()} disabled={!isTauriRuntime || isRunning}>
          Choose file
        </button>
        <input
          value={draft.outputDir}
          onChange={(event) => setDraft({ ...draft, outputDir: event.currentTarget.value })}
          placeholder="Output folder"
        />
        <button type="button" className="button-preset" onClick={() => void chooseOutputFolder()} disabled={!isTauriRuntime || isRunning}>
          Choose output
        </button>
        <select
          value={selectedProvider?.id ?? ""}
          onChange={() => undefined}
          disabled
          aria-label="Selected provider"
        >
          <option value={selectedProvider?.id ?? ""}>
            {selectedProvider
              ? `${selectedProvider.name} / ${selectedProvider.model || "model not set"}`
              : "No provider selected"}
          </option>
        </select>
      </div>

      <div className="template-picker">
        <div className="section-heading">
          <div>
            <div className="section-title">DOCX template</div>
            <p className="helper">
              Keep the report shape explicit before running the Rust workflow. The selected
              template is stored with the job metadata and reused for later LLM wording review.
            </p>
          </div>
          <span className="capability">{getDocumentTemplateLabel(draft.selectedTemplate)}</span>
        </div>
        <div className="template-option-list" role="list" aria-label="Available DOCX templates">
          {DOCUMENT_TEMPLATE_OPTIONS.map((template) => {
            const isActive = draft.selectedTemplate === template.id;
            return (
              <button
                key={template.id}
                type="button"
                className={isActive ? "template-option active" : "template-option"}
                onClick={() => setDraft({ ...draft, selectedTemplate: template.id })}
                disabled={isRunning}
              >
                <span className="template-option-copy">
                  <span className="template-option-title">{template.label}</span>
                  <span className="template-option-description">{template.description}</span>
                  <span className="template-option-highlights">{template.highlights}</span>
                </span>
                <span className="capability">{template.id}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={draft.overwrite}
          onChange={(event) => setDraft({ ...draft, overwrite: event.currentTarget.checked })}
        />
        Allow overwrite when output files already exist
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={privateMode}
          onChange={(event) => setPrivateMode(event.currentTarget.checked)}
        />
        Private mode: do not persist document job metadata between launches
      </label>

      <div className="settings-actions">
        <button
          type="button"
          className="button-save"
          onClick={onStart}
          disabled={!isTauriRuntime || isRunning}
        >
          {isRunning ? "Running..." : "Start workflow"}
        </button>
        <button type="button" className="secondary" onClick={onClear} disabled={jobs.length === 0}>
          Clear metadata
        </button>
      </div>

      <div className="context-preview-card">
        <div className="section-title">LLM wording review</div>
        <p className="helper">
          Use the newest completed Markdown review draft as provider context after inspecting the
          exact payload.
        </p>
        <p className="context-preview-meta">
          Selected provider:{" "}
          {selectedProvider
            ? `${selectedProvider.name} / ${selectedProvider.model || "model not set"}`
            : "No provider selected"}
        </p>
        {latestReviewableJob ? (
          <p className="context-preview-meta">
            Ready source: {latestReviewableJob.fileName} / template{" "}
            {getDocumentTemplateLabel(latestReviewableJob.selectedTemplate)}
          </p>
        ) : (
          <p className="helper">Run a successful local document workflow to prepare reviewable Markdown.</p>
        )}
        <div className="settings-actions">
          <button
            type="button"
            className="button-save"
            onClick={() => latestReviewableJob && onRequestDocumentAssistReview(latestReviewableJob)}
            disabled={!latestReviewableJob || isRunning}
          >
            Review LLM context
          </button>
          <button type="button" className="secondary" onClick={onOpenProviderSettings}>
            Provider settings
          </button>
        </div>
      </div>

      {pendingDocumentContextPreview ? (
        <PromptContextPreviewPanel
          preview={pendingDocumentContextPreview}
          onApprove={onApproveDocumentAssistReview}
          onCancel={onCancelDocumentAssistReview}
        />
      ) : null}

      <ProgressPanel
        progress={progress}
        message={statusMessage || "No document workflow is running."}
        isRunning={isRunning}
        failure={
          latestFailure?.errorSummary && latestFailure.failureKind
            ? {
                summary: latestFailure.errorSummary,
                kind: latestFailure.failureKind,
              }
            : null
        }
        onCancel={onCancel}
      />

      {statusMessage ? <div className="notice notice-neutral">{statusMessage}</div> : null}
      {documentAssistStatus ? (
        <div className={`notice notice-${documentAssistStatus.tone}`}>
          <span>{documentAssistStatus.message}</span>
        </div>
      ) : null}
      {documentAssistReplyError?.details ? (
        <pre className="detail">{documentAssistReplyError.details}</pre>
      ) : null}
      {documentAssistLastResult ? (
        <div className="context-preview-card">
          <div className="section-title">Latest LLM wording output</div>
          <p className="context-preview-meta">
            {documentAssistLastResult.fileName} via {documentAssistLastResult.providerLabel}
          </p>
          <p className="helper">
            This result stays in memory only for the current app session.
          </p>
          <pre className="context-preview-body">{documentAssistLastResult.content}</pre>
          <div className="settings-actions">
            <button type="button" className="secondary" onClick={onClearDocumentAssistResult}>
              Clear in-memory result
            </button>
          </div>
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <ul className="source-list">
          {jobs.map((job) => (
            <li key={job.jobId} className="source-item">
              <div className="source-main">
                <div className="source-meta">
                  <span className="capability">{job.status}</span>
                  <span className="status">{job.fileName}</span>
                </div>
                <p className="source-notes">
                  Template: {getDocumentTemplateLabel(job.selectedTemplate)}
                </p>
                {job.outputPath ? <p className="source-path">{job.outputPath}</p> : null}
                {job.errorSummary ? <p className="source-notes">{job.errorSummary}</p> : null}
                {job.failureKind ? (
                  <p className="source-notes">{documentFailureGuidance(job.failureKind)}</p>
                ) : null}
                {job.warnings && job.warnings.length > 0 ? (
                  <div className="notice notice-warning">
                    <div>
                      <strong>Warnings</strong>
                      <ul className="document-warning-list">
                        {job.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No document job metadata yet.</p>
      )}
    </div>
  );
}
