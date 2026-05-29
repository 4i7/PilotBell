import type { DocumentJobProgress } from "../domain/document";

type ProgressPanelProps = {
  progress: DocumentJobProgress | null;
  message: string;
  isRunning: boolean;
  onCancel: () => void;
};

export function ProgressPanel({ progress, message, isRunning, onCancel }: ProgressPanelProps) {
  const total = progress?.total && progress.total > 0 ? progress.total : 1;
  const current = progress ? Math.min(progress.current, total) : 0;
  const percent = Math.round((current / total) * 100);

  return (
    <div className="progress-panel">
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
    </div>
  );
}
