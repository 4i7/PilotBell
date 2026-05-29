import {
  type ChangeEvent,
  type ComponentType,
  type DragEvent,
  type FormEvent,
  type RefObject,
  type SVGProps,
  useCallback,
} from "react";
import type { ProviderConfig } from "../domain/provider";
import type { AttachedPromptFile } from "../domain/prompt";
import type { PromptInputPreferences } from "../domain/inputPreferences";
import { useAutoResizeTextarea } from "../hooks/useAutoResizeTextarea";
import { usePromptSubmitHotkey } from "../hooks/usePromptSubmitHotkey";
import type { ProviderHealthRecord, ProviderReadiness } from "../lib/providerHealthStore";
import { ProviderSelector } from "./ProviderSelector";
import { StatusLine } from "./StatusLine";

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
  inputPreferences: PromptInputPreferences;
  icons: PromptComposerIcons;
  formatBytes: (size: number) => string;
  readinessLabel: (readiness: ProviderReadiness) => string;
  setProviderMenuOpen: (value: boolean | ((current: boolean) => boolean)) => void;
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
  inputPreferences,
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
  const isEmptySession = sessionEntryCount === 0;

  const canSubmit =
    Boolean(prompt.trim()) &&
    Boolean(selectedProvider) &&
    isTauriRuntime &&
    !isMigratingProviders &&
    (!isSending || inputPreferences.allowSubmitWhileSending);

  const requestSubmit = useCallback(() => {
    if (!canSubmit) {
      return;
    }

    onSubmitPrompt();
  }, [canSubmit, onSubmitPrompt]);

  useAutoResizeTextarea({
    enabled: inputPreferences.autoResize,
    value: prompt,
    textareaRef: promptRef,
    minRows: isEmptySession ? 10 : 2,
    maxRows: isEmptySession ? 18 : 8,
    maxHeightVh: isEmptySession ? 70 : 35,
  });

  usePromptSubmitHotkey({
    mode: inputPreferences.submitShortcut,
    textareaRef: promptRef,
    onSubmit: requestSubmit,
  });

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestSubmit();
  }

  return (
    <form
      className={[
        "composer-dock",
        isEmptySession ? "empty-composer" : "",
        isDraggingFiles ? "dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onSubmit={submitPrompt}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {shouldPromptInitialSetup ? (
        <p className="composer-setup-note">
          No provider configured. Add OpenAI, Anthropic, Ollama, or llama.cpp to start.
        </p>
      ) : null}

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

      <div className="composer-layout">
        <div className="composer-main">
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
                placeholder={shouldPromptInitialSetup ? "Add a provider in settings..." : "Ask PilotBell..."}
                rows={2}
              />
            </label>
          </div>
        </div>

        <div className="composer-side">
          <ProviderSelector
            selectedProvider={selectedProvider}
            selectedProviderId={selectedProviderId}
            providers={providers}
            providerHealthRecords={providerHealthRecords}
            providerMenuOpen={providerMenuOpen}
            providerMenuRef={providerMenuRef}
            isDisabled={isProviderActionsDisabled}
            selectedProviderLabel={selectedProviderLabel}
            readinessLabel={readinessLabel}
            setProviderMenuOpen={setProviderMenuOpen}
            setSelectedProviderId={setSelectedProviderId}
            openProviderSettings={openProviderSettings}
            ChevronDownIcon={ChevronDownIcon}
          />

          <button
            type="submit"
            className="send-button"
            disabled={!canSubmit}
            aria-label="Send prompt"
          >
            <ArrowUpIcon />
            <span>Send</span>
          </button>
        </div>
      </div>

      <StatusLine
        selectedProvider={selectedProvider}
        selectedProviderHealth={selectedProviderHealth}
        readinessLabel={readinessLabel}
        isTestingProvider={isTestingProvider}
        isProviderActionsDisabled={isProviderActionsDisabled}
        isTauriRuntime={isTauriRuntime}
        sessionEntryCount={sessionEntryCount}
        testProvider={testProvider}
        clearSession={clearSession}
      />
    </form>
  );
}
