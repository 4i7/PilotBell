import { open } from "@tauri-apps/plugin-dialog";

import type { DocumentJobDraft, DocumentJobMetadata, DocumentJobProgress } from "../domain/document";
import type { ProviderConfig } from "../domain/provider";
import { ProgressPanel } from "./ProgressPanel";

type DocumentWorkflowPanelProps = {
  draft: DocumentJobDraft;
  setDraft: (draft: DocumentJobDraft) => void;
  jobs: DocumentJobMetadata[];
  providers: ProviderConfig[];
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
  providers,
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

  return (
    <div className="settings-section">
      <div className="settings-summary-card">
        <div>
          <h3>Document workflow</h3>
          <p>
            Analyze a selected PDF or Excel workbook in Rust, then generate reviewable Markdown,
            sanitized SVG, and DOCX outputs. Document text is not stored in localStorage.
          </p>
        </div>
      </div>

      <div className="notice notice-warning">
        Local document excerpts may be included in prompts sent to the selected provider. Review the
        context before sending sensitive data.
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
          value={draft.providerId}
          onChange={(event) => setDraft({ ...draft, providerId: event.currentTarget.value })}
        >
          <option value="">No LLM provider selected</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name} / {provider.model || "model not set"}
            </option>
          ))}
        </select>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={draft.overwrite}
          onChange={(event) => setDraft({ ...draft, overwrite: event.currentTarget.checked })}
        />
        Confirm overwrite when output files already exist
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
