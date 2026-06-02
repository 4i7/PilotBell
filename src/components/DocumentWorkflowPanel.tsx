import { open } from "@tauri-apps/plugin-dialog";

import { documentFailureGuidance, type DocumentJobDraft, type DocumentJobMetadata, type DocumentJobProgress } from "../domain/document";
import { ProgressPanel } from "./ProgressPanel";

type DocumentWorkflowPanelProps = {
  draft: DocumentJobDraft;
  setDraft: (draft: DocumentJobDraft) => void;
  jobs: DocumentJobMetadata[];
  progress: DocumentJobProgress | null;
  statusMessage: string;
  isRunning: boolean;
  isTauriRuntime: boolean;
  onStart: () => void;
  onCancel: () => void;
  onClear: () => void;
};

export function DocumentWorkflowPanel({
  draft,
  setDraft,
  jobs,
  progress,
  statusMessage,
  isRunning,
  isTauriRuntime,
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

  const latestFailure = jobs.find((job) => job.status === "failed") ?? null;

  return (
    <div className="settings-section">
      <div className="settings-summary-card">
        <div>
          <h3>Document workflow</h3>
          <p>
            Analyze a selected PDF or Excel workbook in Rust, then generate reviewable Markdown,
            sanitized SVG, and DOCX outputs. Document text is not stored in localStorage and is not
            sent to a provider by this workflow today.
          </p>
        </div>
      </div>

      <div className="notice notice-neutral">
        Provider-assisted drafting is reserved for a future slice. The current document workflow
        runs locally in Rust, and provider selection is intentionally disabled until that changes.
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
          value={draft.selectedTemplate}
          onChange={(event) => setDraft({ ...draft, selectedTemplate: event.currentTarget.value })}
        >
          <option value="standard-review">Standard review report</option>
          <option value="validation-summary">Validation summary</option>
          <option value="executive-brief">Executive brief</option>
        </select>
        <select
          value=""
          disabled
          aria-label="Provider-assisted drafting is not available yet"
        >
          <option value="">Provider-assisted drafting reserved for future release</option>
        </select>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={draft.overwrite}
          onChange={(event) => setDraft({ ...draft, overwrite: event.currentTarget.checked })}
        />
        Allow overwrite when output files already exist
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

      {jobs.length > 0 ? (
        <ul className="source-list">
          {jobs.map((job) => (
            <li key={job.jobId} className="source-item">
              <div className="source-main">
                <div className="source-meta">
                  <span className="capability">{job.status}</span>
                  <span className="status">{job.fileName}</span>
                </div>
                <p className="source-path">{job.outputPath}</p>
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
