import type { PromptContextPreview } from "../domain/prompt";

type PromptContextPreviewPanelProps = {
  preview: PromptContextPreview;
  onApprove: () => void;
  onCancel: () => void;
};

export function PromptContextPreviewPanel({
  preview,
  onApprove,
  onCancel,
}: PromptContextPreviewPanelProps) {
  return (
    <section
      className="context-preview-panel"
      aria-label="Prompt context review"
    >
      <div className="section-heading">
        <div>
          <div className="section-title">Prompt context review</div>
          <p className="helper">
            This is the exact prompt body that will be sent once approved.
          </p>
        </div>
        <span className={`readiness readiness-${preview.providerRisk.tone}`}>
          {preview.requiresCloudReview ? "Cloud review required" : "Local review"}
        </span>
      </div>

      <div className="context-preview-grid">
        <div className="context-preview-card">
          <div className="section-title">Provider</div>
          <p className="context-preview-meta">{preview.providerLabel}</p>
          <p className="context-preview-meta">Destination host: {preview.providerHost}</p>
          <p className="context-preview-meta">{preview.providerEndpoint}</p>
          <p className="context-preview-risk">{preview.providerRisk.summary}</p>
          <p className="context-preview-meta">
            Stored API key used: {preview.secretWillBeUsed ? "Yes" : "No"}
          </p>
          <p className="context-preview-meta">
            Estimated prompt size: {preview.estimatedChars.toLocaleString()} characters
          </p>
        </div>

        <div className="context-preview-card">
          <div className="section-title">Attachments</div>
          {preview.attachments.length > 0 ? (
            <ul className="context-preview-list">
              {preview.attachments.map((file) => (
                <li key={file.id} className="context-preview-item">
                  <div className="context-preview-file">
                    <strong>{file.name}</strong>
                    <span>
                      {file.size.toLocaleString()} bytes
                      {file.type ? ` / ${file.type}` : ""}
                    </span>
                  </div>
                  <p className="context-preview-meta">
                    Included characters: {file.includedCharCount.toLocaleString()}
                  </p>
                  {file.note ? <p className="context-preview-risk">{file.note}</p> : null}
                  {file.excerpt ? (
                    <pre className="context-preview-body">{file.excerpt}</pre>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="helper">No local attachment context is queued for this send.</p>
          )}
        </div>
      </div>

      {preview.warnings.length > 0 ? (
        <div className="notice notice-warning">
          <div>
            <strong>Warnings</strong>
            <ul className="context-preview-warning-list">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className={preview.requiresExplicitOptIn ? "notice notice-warning" : "notice notice-neutral"}>
        <div>
          <strong>{preview.requiresExplicitOptIn ? "Explicit opt-in required" : "Review required"}</strong>
          <p>{preview.reviewReason}</p>
        </div>
      </div>

      <div className="context-preview-card">
        <div className="section-title">Final prompt body</div>
        <pre className="context-preview-body">{preview.preparedPrompt}</pre>
      </div>

      <div className="settings-actions">
        <button type="button" className="button-save" onClick={onApprove}>
          {preview.requiresExplicitOptIn ? "I understand, send anyway" : "Send reviewed prompt"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel review
        </button>
      </div>
    </section>
  );
}
