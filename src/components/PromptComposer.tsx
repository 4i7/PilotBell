import {
  type ChangeEvent,
  type ComponentType,
  type Dispatch,
  type DragEvent,
  type FormEvent,
  type RefObject,
  type SetStateAction,
  type SVGProps,
} from "react";
import type { ProviderConfig } from "../domain/provider";
import type { AttachedPromptFile } from "../domain/prompt";
import type { ProviderHealthRecord, ProviderReadiness } from "../lib/providerHealthStore";

type PromptComposerIcons = {
  Attach: ComponentType<SVGProps<SVGSVGElement>>;
  ArrowUp: ComponentType<SVGProps<SVGSVGElement>>;
  ChevronDown: ComponentType<SVGProps<SVGSVGElement>>;
  Close: ComponentType<SVGProps<SVGSVGElement>>;
};

type PromptComposerProps = {
  prompt: string;
  setPrompt: (value: string) => void;
  attachedFiles: AttachedPromptFile[];
  isDraggingFiles: boolean;
  isSending: boolean;
  isTauriRuntime: boolean;
  isMigratingProviders: boolean;
  isProviderActionsDisabled: boolean;
  isTestingProvider: boolean;
  shouldPromptInitialSetup: boolean;
  selectedProvider: ProviderConfig | null;
  selectedProviderId: string;
  selectedProviderLabel: string;
  selectedProviderHealth: ProviderHealthRecord | null;
  providers: ProviderConfig[];
  providerHealthRecords: Record<string, ProviderHealthRecord>;
  providerMenuOpen: boolean;
  sessionEntryCount: number;
  fileInputRef: RefObject<HTMLInputElement | null>;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  providerMenuRef: RefObject<HTMLDivElement | null>;
  icons: PromptComposerIcons;
  formatBytes: (size: number) => string;
  readinessLabel: (readiness: ProviderReadiness) => string;
  setProviderMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedProviderId: (providerId: string) => void;
  onSubmitPrompt: () => void;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (event: DragEvent<HTMLFormElement>) => void;
  onDragLeave: (event: DragEvent<HTMLFormElement>) => void;
  onDrop: (event: DragEvent<HTMLFormElement>) => void;
  removeAttachment: (attachmentId: string) => void;
  openProviderSettings: () => void;
  testProvider: () => void;
  clearSession: () => void;
};

export function PromptComposer({
  prompt,
  setPrompt,
  attachedFiles,
  isDraggingFiles,
  isSending,
  isTauriRuntime,
  isMigratingProviders,
  isProviderActionsDisabled,
  isTestingProvider,
  shouldPromptInitialSetup,
  selectedProvider,
  selectedProviderId,
  selectedProviderLabel,
  selectedProviderHealth,
  providers,
  providerHealthRecords,
  providerMenuOpen,
  sessionEntryCount,
  fileInputRef,
  promptRef,
  providerMenuRef,
  icons,
  formatBytes,
  readinessLabel,
  setProviderMenuOpen,
  setSelectedProviderId,
  onSubmitPrompt,
  onFileInputChange,
  onDragOver,
  onDragLeave,
  onDrop,
  removeAttachment,
  openProviderSettings,
  testProvider,
  clearSession,
}: PromptComposerProps) {
  const AttachIcon = icons.Attach;
  const ArrowUpIcon = icons.ArrowUp;
  const ChevronDownIcon = icons.ChevronDown;
  const CloseIcon = icons.Close;

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmitPrompt();
  }

  return (
    <form
      className={isDraggingFiles ? "composer-dock dragging" : "composer-dock"}
      onSubmit={submitPrompt}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {attachedFiles.length > 0 ? (
        <div className="attachment-strip">
          {attachedFiles.map((file) => (
            <div key={file.id} className="attachment-chip">
              <div>
                <strong>{file.name}</strong>
                <span>
                  {formatBytes(file.size)}
                  {file.note ? ` / ${file.note}` : ""}
                </span>
              </div>
              <button
                type="button"
                className="attachment-remove"
                onClick={() => removeAttachment(file.id)}
                aria-label={`Remove ${file.name}`}
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="composer-row">
        <button
          type="button"
          className="attach-button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Add attachment"
        >
          <AttachIcon />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden-input"
          multiple
          onChange={onFileInputChange}
        />

        <label className="composer-input" htmlFor="prompt">
          <textarea
            id="prompt"
            ref={promptRef}
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            placeholder={
              shouldPromptInitialSetup
                ? "Set up a provider, or ask anyway after saving one..."
                : "Ask PilotBell..."
            }
            rows={1}
          />
        </label>

        <div className="composer-controls">
          <div className="provider-switcher" ref={providerMenuRef}>
            <button
              type="button"
              className="provider-switcher-button"
              onClick={() => setProviderMenuOpen((current) => !current)}
            >
              <span>{selectedProviderLabel}</span>
              <ChevronDownIcon />
            </button>
            {providerMenuOpen ? (
              <div className="provider-menu">
                {providers.length > 0 ? (
                  providers.map((provider) => {
                    const readiness = providerHealthRecords[provider.id]?.readiness ?? "unknown";
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        className={
                          provider.id === selectedProviderId
                            ? "provider-menu-item active"
                            : "provider-menu-item"
                        }
                        onClick={() => {
                          setSelectedProviderId(provider.id);
                          setProviderMenuOpen(false);
                        }}
                      >
                        <div>
                          <strong>{provider.model || "model not set"}</strong>
                          <span>{provider.name}</span>
                        </div>
                        <span className={`readiness readiness-${readiness}`}>
                          {readinessLabel(readiness)}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="provider-menu-empty">No providers saved yet.</div>
                )}
                <div className="provider-menu-divider" />
                <button
                  type="button"
                  className="provider-menu-item settings-item"
                  onClick={openProviderSettings}
                >
                  Settings...
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="submit"
            className="send-button"
            disabled={
              isSending ||
              !isTauriRuntime ||
              isMigratingProviders ||
              !selectedProvider ||
              !prompt.trim()
            }
            aria-label="Send prompt"
          >
            <ArrowUpIcon />
          </button>
        </div>
      </div>

      <div className="composer-footer">
        <div className="composer-status-line">
          {selectedProvider ? (
            <>
              <span className="status-pill">
                {selectedProvider.name} / {selectedProvider.model || "model not set"}
              </span>
              <span
                className={`readiness readiness-${selectedProviderHealth?.readiness ?? "unknown"}`}
              >
                {readinessLabel(selectedProviderHealth?.readiness ?? "unknown")}
              </span>
            </>
          ) : (
            <span className="status-pill">No provider selected</span>
          )}
        </div>
        <div className="composer-actions">
          <button
            type="button"
            className="ghost-action"
            onClick={testProvider}
            disabled={
              !isTauriRuntime ||
              isProviderActionsDisabled ||
              isTestingProvider ||
              !selectedProvider
            }
          >
            {isTestingProvider ? "Testing..." : "Test API"}
          </button>
          <button
            type="button"
            className="ghost-action"
            onClick={clearSession}
            disabled={sessionEntryCount === 0}
          >
            Clear chat
          </button>
        </div>
      </div>
    </form>
  );
}
