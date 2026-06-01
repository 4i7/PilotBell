import type { Dispatch, SetStateAction } from "react";

import {
  DIRECTORY_SOURCE_KIND,
  FILE_SOURCE_KIND,
  type LocalSource,
  type LocalSourceDraft,
  type LocalSourceKind,
} from "../domain/source";

type StatusTone = "neutral" | "success" | "warning" | "error";

type InlineStatus = {
  tone: StatusTone;
  message: string;
};

type SourceSettingsSectionProps = {
  sourceDraft: LocalSourceDraft;
  setSourceDraft: Dispatch<SetStateAction<LocalSourceDraft>>;
  editingSource: LocalSource | null;
  localSources: LocalSource[];
  sourceStatus: InlineStatus | null;
  isTauriRuntime: boolean;
  isSourceActionsDisabled: boolean;
  removingSourceId: string;
  saveSource: () => void;
  cancelSourceEdit: () => void;
  beginEditSource: (source: LocalSource) => void;
  removeSource: (sourceId: string) => void;
};

const SOURCE_KIND_OPTIONS: Array<{ value: LocalSourceKind; label: string }> = [
  { value: DIRECTORY_SOURCE_KIND, label: "Directory" },
  { value: FILE_SOURCE_KIND, label: "File" },
];

export function SourceSettingsSection({
  sourceDraft,
  setSourceDraft,
  editingSource,
  localSources,
  sourceStatus,
  isTauriRuntime,
  isSourceActionsDisabled,
  removingSourceId,
  saveSource,
  cancelSourceEdit,
  beginEditSource,
  removeSource,
}: SourceSettingsSectionProps) {
  return (
    <div className="settings-section">
      <div className="settings-summary-card">
        <div>
          <h3>Deprecated local sources</h3>
          <p>
            Persistent local source indexing is deprecated. New document workflows process
            user-selected files temporarily and do not store extracted text or chunks.
          </p>
        </div>
      </div>

      <div className="settings-grid">
        <select
          value={sourceDraft.kind}
          onChange={(event) =>
            setSourceDraft({
              ...sourceDraft,
              kind: event.currentTarget.value as LocalSourceKind,
            })
          }
        >
          {SOURCE_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={sourceDraft.name}
          onChange={(event) =>
            setSourceDraft({ ...sourceDraft, name: event.currentTarget.value })
          }
          placeholder="Source name"
        />
        <input
          value={sourceDraft.path}
          onChange={(event) =>
            setSourceDraft({ ...sourceDraft, path: event.currentTarget.value })
          }
          placeholder="Path (e.g. C:\\Users\\...\\Docs)"
        />
        <input
          value={sourceDraft.notes}
          onChange={(event) =>
            setSourceDraft({ ...sourceDraft, notes: event.currentTarget.value })
          }
          placeholder="Notes (optional)"
        />
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="button-save"
          onClick={saveSource}
          disabled={!isTauriRuntime || isSourceActionsDisabled}
        >
          {editingSource ? "Update source" : "Save source"}
        </button>
        {editingSource ? (
          <button
            type="button"
            className="secondary"
            onClick={cancelSourceEdit}
            disabled={isSourceActionsDisabled}
          >
            Cancel edit
          </button>
        ) : null}
      </div>

      {sourceStatus ? (
        <div className={`notice notice-${sourceStatus.tone}`}>{sourceStatus.message}</div>
      ) : null}

      <p className="status">
        {localSources.length} deprecated local source registration(s). Persistent index snapshots are
        cleared on startup.
      </p>

      {localSources.length > 0 ? (
        <ul className="source-list">
          {localSources.map((source) => (
            <li key={source.id} className="source-item">
              <div className="source-main">
                <div className="source-meta">
                  <span className="capability">
                    {source.kind === DIRECTORY_SOURCE_KIND ? "Directory" : "File"}
                  </span>
                  <span className="status">{source.name}</span>
                </div>
                <p className="source-path">{source.path}</p>
                {source.notes ? <p className="source-notes">{source.notes}</p> : null}
              </div>
              <div className="history-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => beginEditSource(source)}
                  disabled={!isTauriRuntime || isSourceActionsDisabled}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => removeSource(source.id)}
                  disabled={!isTauriRuntime || isSourceActionsDisabled}
                >
                  {removingSourceId === source.id ? "Removing..." : "Remove"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">
          {!isTauriRuntime
            ? "Open PilotBell through Tauri to register local sources."
            : "Use the Documents tab for temporary per-workflow processing."}
        </p>
      )}
    </div>
  );
}
