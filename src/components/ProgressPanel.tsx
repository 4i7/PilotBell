import { documentFailureGuidance, type DocumentFailureKind, type DocumentJobProgress } from "../domain/document";

type ProgressPanelProps = {
  progress: DocumentJobProgress | null;
  message: string;
  isRunning: boolean;
  failure: {
    summary: string;
    kind: DocumentFailureKind;
  } | null;
  onCancel: () => void;
};

export function ProgressPanel({ progress, message, isRunning, failure, onCancel }: ProgressPanelProps) {
  const total = progress?.total && progress.total > 0 ? progress.total : 1;
  const current = progress ? Math.min(progress.current, total) : 0;
  const percent = Math.round((current / total) * 100);
  const guidance = failure ? documentFailureGuidance(failure.kind) : null;

  return (
    <div className={`progress-panel ${failure ? "progress-panel-failed" : ""}`}>
      <div className="section-heading">
        <div>
          <div className="section-title">Document progress</div>
          <p className="helper">{progress?.message ?? message}</p>
        </div>
        <span className="status">{progress?.phase ?? "idle"}</span>
      </div>
      <div className="progress-track" aria-label="Document job progress">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="settings-actions">
        <span className="status">{percent}%</span>
        <button type="button" className="secondary" onClick={onCancel} disabled={!isRunning}>
          Cancel job
        </button>
      </div>
      {failure ? (
        <div className="notice notice-error">
          <div>
            <strong>Last run failed</strong>
            <p className="helper">{failure.summary}</p>
            <p className="helper">{guidance}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
