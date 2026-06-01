import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type ProviderConfig, providerIsCloud } from "./domain/provider";
import type { AttachedPromptFile } from "./domain/prompt";
import type { PromptInputPreferences } from "./domain/inputPreferences";
import { DEFAULT_PROMPT_INPUT_PREFERENCES } from "./domain/inputPreferences";
import { AppChrome } from "./components/AppChrome";
import { DocumentWorkflowPanel } from "./components/DocumentWorkflowPanel";
import { ProviderSettingsSection } from "./components/ProviderSettingsSection";
import { PromptComposer } from "./components/PromptComposer";
import { SettingsPanel } from "./components/SettingsPanel";
import { SessionHistory } from "./components/SessionHistory";
import { SourceSettingsSection } from "./components/SourceSettingsSection";
import {
  ArrowUpIcon,
  AttachIcon,
  ChevronDownIcon,
  CloseIcon,
  type IconComponent,
  MinusIcon,
  MonitorIcon,
  MoonIcon,
  RestoreIcon,
  SettingsIcon,
  SquareIcon,
  SunIcon,
} from "./components/icons";
import { useDocumentJobs } from "./hooks/useDocumentJobs";
import { useLocalSources } from "./hooks/useLocalSources";
import { useProviderManagement } from "./hooks/useProviderManagement";
import {
  loadPromptInputPreferences,
  savePromptInputPreferences,
} from "./lib/inputPreferenceStore";
import {
  type PromptSessionEntry,
  loadPromptSession,
  savePromptSession,
} from "./lib/sessionStore";
import { type ProviderCommandError, sendProviderPrompt } from "./lib/providerCommands";
import { formatBytes, formatRelativeTime, formatSessionTime } from "./lib/formatters";
import { buildPromptWithAttachments, readAttachedPromptFile } from "./lib/promptAttachments";
import { type ProviderReadiness } from "./lib/providerHealthStore";
import {
  type ResolvedTheme,
  type ThemePreference,
  loadThemePreference,
  resolveThemePreference,
  saveThemePreference,
} from "./lib/themeStore";
import "./App.css";

type StatusTone = "neutral" | "success" | "warning" | "error";

type InlineStatus = {
  tone: StatusTone;
  message: string;
  dismissKey?: "global-shortcut";
};

type AppShellState = {
  activeShortcut: string;
  usedFallbackShortcut: boolean;
  globalShortcutRegistered: boolean;
  message?: string | null;
};

type SettingsSection = "providers" | "documents" | "sources";

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: IconComponent;
}> = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];

const FOCUS_PROMPT_EVENT = "pilotbell://focus-prompt";
const SETTINGS_SECTION_EVENT = "pilotbell://settings-section";
const GLOBAL_SHORTCUT_NOTICE_STORAGE_KEY = "pilotbell.hideGlobalShortcutNotice";
const BROWSER_PREVIEW_MESSAGE =
  "Browser preview mode detected. PilotBell desktop features require `npm run tauri dev` or a packaged Tauri build.";

function hasTauriRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    "undefined"
  );
}

function detectSystemTheme(): ResolvedTheme {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

function toneForProviderError(error: ProviderCommandError): StatusTone {
  if (
    error.kind === "validation" ||
    error.kind === "response_format" ||
    error.kind === "secret_store"
  ) {
    return "warning";
  }

  return "error";
}

function localValidationError(message: string): ProviderCommandError {
  return {
    kind: "validation",
    message,
    retryable: false,
  };
}

function makeSessionEntryId() {
  return `session-${crypto.randomUUID()}`;
}

function readinessLabel(readiness: ProviderReadiness) {
  switch (readiness) {
    case "ready":
      return "Ready";
    case "warning":
      return "Needs attention";
    case "error":
      return "Offline";
    case "unknown":
      return "Untested";
  }
}

function isSettingsSection(value: unknown): value is SettingsSection {
  return value === "providers" || value === "documents" || value === "sources";
}

function getInitialSettingsSection(): SettingsSection {
  if (typeof window === "undefined") {
    return "providers";
  }

  const section = new URLSearchParams(window.location.search).get("section");
  return isSettingsSection(section) ? section : "providers";
}

function isSettingsWindowView() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("view") === "settings";
}

function loadGlobalShortcutNoticeHidden() {
  return localStorage.getItem(GLOBAL_SHORTCUT_NOTICE_STORAGE_KEY) === "true";
}

function App() {
  const [prompt, setPrompt] = useState("");
  const [replyError, setReplyError] = useState<ProviderCommandError | null>(null);
  const [shellState, setShellState] = useState<AppShellState | null>(null);
  const [sessionEntries, setSessionEntries] = useState<PromptSessionEntry[]>(() =>
    loadPromptSession(),
  );
  const [pendingSendCount, setPendingSendCount] = useState(0);
  const [chatStatus, setChatStatus] = useState<InlineStatus | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    loadThemePreference(),
  );
  const [inputPreferences, setInputPreferences] = useState<PromptInputPreferences>(() =>
    loadPromptInputPreferences(),
  );
  const [isGlobalShortcutNoticeHidden, setIsGlobalShortcutNoticeHidden] = useState(() =>
    loadGlobalShortcutNoticeHidden(),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => detectSystemTheme());
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>(getInitialSettingsSection);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedPromptFile[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [cloudContextReviewAccepted, setCloudContextReviewAccepted] = useState(false);

  const isTauriRuntime = useMemo(() => hasTauriRuntime(), []);
  const isSettingsWindow = useMemo(() => isSettingsWindowView(), []);
  const documentJobs = useDocumentJobs(isTauriRuntime);
  const {
    providers,
    providerDraft,
    setProviderDraft,
    providerDraftRequiresApiKey,
    providerEndpointRisk,
    editingProvider,
    providerHealthRecords,
    selectedProvider,
    selectedProviderHealth,
    selectedProviderId,
    setSelectedProviderId,
    providerStatus,
    hasReadyProvider,
    isProviderActionsDisabled,
    isSavingProvider,
    isMigratingProviders,
    isTestingProvider,
    removingProviderId,
    applyOpenAIPreset,
    applyAnthropicPreset,
    applyOllamaPreset,
    applyLlamaCppPreset,
    addProvider,
    updateProvider,
    cancelProviderEdit,
    beginEditProvider,
    removeProvider,
    testProvider,
    diagnoseSelectedProviderSecret,
    repairSelectedProviderSecretMetadata,
    deleteSelectedProviderSecretOnly,
  } = useProviderManagement({
    browserPreviewMessage: BROWSER_PREVIEW_MESSAGE,
    isTauriRuntime,
    openProviderSettings: () => openSettings("providers"),
    toneForProviderError,
  });
  const resolvedTheme = resolveThemePreference(themePreference, systemTheme);
  const isSending = pendingSendCount > 0;
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const chatEntries = useMemo(() => [...sessionEntries].reverse(), [sessionEntries]);
  const hasSuccessfulSession = useMemo(
    () => sessionEntries.some((entry) => Boolean(entry.response)),
    [sessionEntries],
  );
  const shouldPromptInitialSetup = !hasReadyProvider && !hasSuccessfulSession;
  const shouldShowSettings = settingsOpen;
  const {
    localSources,
    sourceDraft,
    setSourceDraft,
    editingSource,
    sourceStatus,
    setSourceStatus,
    isSourceActionsDisabled,
    removingSourceId,
    saveSource,
    cancelSourceEdit,
    beginEditSource,
    removeSource,
  } = useLocalSources(() => openSettings("sources"));

  function persistSessionEntries(next: PromptSessionEntry[]) {
    setSessionEntries(next);
    savePromptSession(next);
  }

  function persistThemePreference(next: ThemePreference) {
    setThemePreference(next);
    saveThemePreference(next);
  }

  function persistInputPreferences(next: PromptInputPreferences) {
    setInputPreferences(next);
    savePromptInputPreferences(next);
  }

  function updateInputPreferences(
    updater: (current: PromptInputPreferences) => PromptInputPreferences,
  ) {
    const next = updater(inputPreferences);
    persistInputPreferences(next);
  }

  function addSessionEntry(entry: PromptSessionEntry) {
    setSessionEntries((current) => {
      const next = [entry, ...current];
      savePromptSession(next);
      return next;
    });
  }

  function openSettings(section: SettingsSection = "providers") {
    setSettingsSection(section);
    setProviderMenuOpen(false);

    if (isTauriRuntime && !isSettingsWindow) {
      void invoke("open_settings_window", { section }).catch((err) => {
        setSettingsOpen(true);
        setChatStatus({
          tone: "warning",
          message: err instanceof Error ? err.message : String(err),
        });
      });
      return;
    }

    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
  }

  async function hidePaletteWindow() {
    return invoke("hide_palette_window");
  }

  function dismissGlobalShortcutNotice() {
    localStorage.setItem(GLOBAL_SHORTCUT_NOTICE_STORAGE_KEY, "true");
    setIsGlobalShortcutNoticeHidden(true);
    setChatStatus((current) => (current?.dismissKey === "global-shortcut" ? null : current));
  }

  async function startWindowDrag() {
    if (!isTauriRuntime) {
      return;
    }

    await getCurrentWindow().startDragging();
  }

  async function minimizeWindow() {
    await getCurrentWindow().minimize();
  }

  async function toggleMaximizeWindow() {
    const currentWindow = getCurrentWindow();
    await currentWindow.toggleMaximize();
    setIsWindowMaximized(await currentWindow.isMaximized());
  }

  async function closeWindow() {
    await getCurrentWindow().close();
  }

  useEffect(() => {
    if (!selectedProviderId && providers.length > 0) {
      setSelectedProviderId(providers[0].id);
      return;
    }

    if (
      selectedProviderId &&
      providers.length > 0 &&
      !providers.some((provider) => provider.id === selectedProviderId)
    ) {
      setSelectedProviderId(providers[0].id);
    }
  }, [providers, selectedProviderId]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    updateTheme();
    mediaQuery.addEventListener("change", updateTheme);

    return () => {
      mediaQuery.removeEventListener("change", updateTheme);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = themePreference;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, themePreference]);

  useEffect(() => {
    if (!isTauriRuntime) {
      return;
    }

    const currentWindow = getCurrentWindow();
    let unlistenResize: (() => void) | undefined;
    let cancelled = false;

    async function syncWindowState() {
      const maximized = await currentWindow.isMaximized();
      if (!cancelled) {
        setIsWindowMaximized(maximized);
      }
    }

    void syncWindowState();
    void currentWindow.onResized(async () => {
      await syncWindowState();
    }).then((unlisten) => {
      unlistenResize = unlisten;
    });

    return () => {
      cancelled = true;
      unlistenResize?.();
    };
  }, [isTauriRuntime]);

  useEffect(() => {
    if (!isSettingsWindow || !isTauriRuntime) {
      return;
    }

    let unlistenSettingsSection: (() => void) | undefined;

    void listen<string>(SETTINGS_SECTION_EVENT, (event) => {
      if (isSettingsSection(event.payload)) {
        setSettingsSection(event.payload);
      }
    }).then((unlisten) => {
      unlistenSettingsSection = unlisten;
    });

    return () => {
      unlistenSettingsSection?.();
    };
  }, [isSettingsWindow, isTauriRuntime]);

  useEffect(() => {
    if (!providerMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!providerMenuRef.current?.contains(event.target as Node)) {
        setProviderMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [providerMenuOpen]);

  useEffect(() => {
    if (!shouldShowSettings) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!settingsPanelRef.current?.contains(event.target as Node)) {
        closeSettings();
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [shouldShowSettings]);

  useEffect(() => {
    if (isSettingsWindow) {
      return;
    }

    if (!isTauriRuntime) {
      setSourceStatus({
        tone: "warning",
        message: BROWSER_PREVIEW_MESSAGE,
      });
      setChatStatus({
        tone: "warning",
        message: BROWSER_PREVIEW_MESSAGE,
      });
      return;
    }

    let cancelled = false;

    async function loadShellState() {
      const nextShellState = await invoke<AppShellState>("get_app_shell_state");
      if (cancelled) {
        return;
      }

      setShellState(nextShellState);

      if (nextShellState.message && !isGlobalShortcutNoticeHidden) {
        setChatStatus({
          tone:
            nextShellState.globalShortcutRegistered && !nextShellState.usedFallbackShortcut
              ? "success"
              : nextShellState.globalShortcutRegistered
                ? "warning"
                : "error",
          message: nextShellState.message,
          dismissKey: "global-shortcut",
        });
      }

      const currentWindow = getCurrentWindow();
      // Keep the window reachable after a normal minimize action.
      await currentWindow.setSkipTaskbar(false);
      await currentWindow.setAlwaysOnTop(nextShellState.globalShortcutRegistered);
      if (nextShellState.globalShortcutRegistered) {
        await currentWindow.setFocus();
        promptRef.current?.focus();
      }
    }

    void loadShellState();

    return () => {
      cancelled = true;
    };
  }, [isGlobalShortcutNoticeHidden, isSettingsWindow, isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime || isSettingsWindow) {
      return;
    }

    const currentWindow = getCurrentWindow();
    let unlistenWindowFocus: (() => void) | undefined;
    let removeEscapeListener: (() => void) | undefined;

    async function bindPaletteWindowBehavior() {
      unlistenWindowFocus = await listen(FOCUS_PROMPT_EVENT, async () => {
        promptRef.current?.focus();
        await currentWindow.setAlwaysOnTop(true);
        await currentWindow.setFocus();
      });

      const handleEscape = async (keyboardEvent: KeyboardEvent) => {
        if (keyboardEvent.key !== "Escape" || !shellState?.globalShortcutRegistered) {
          return;
        }

        if (providerMenuOpen) {
          keyboardEvent.preventDefault();
          setProviderMenuOpen(false);
          return;
        }

        if (settingsOpen) {
          keyboardEvent.preventDefault();
          closeSettings();
          return;
        }

        keyboardEvent.preventDefault();
        await hidePaletteWindow();
      };

      window.addEventListener("keydown", handleEscape);
      removeEscapeListener = () => window.removeEventListener("keydown", handleEscape);
    }

    void bindPaletteWindowBehavior();

    return () => {
      unlistenWindowFocus?.();
      removeEscapeListener?.();
    };
  }, [isSettingsWindow, isTauriRuntime, providerMenuOpen, settingsOpen, shellState]);

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setChatStatus({
        tone: "success",
        message: `${label} copied to clipboard.`,
      });
    } catch (err) {
      setChatStatus({
        tone: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function clearSession() {
    persistSessionEntries([]);
    setReplyError(null);
    setChatStatus({
      tone: "neutral",
      message: "Chat cleared.",
    });
  }

  function retrySessionEntry(entry: PromptSessionEntry) {
    const provider = providers.find((candidate) => candidate.id === entry.providerId);
    if (!provider) {
      setChatStatus({
        tone: "warning",
        message: "The provider used for that prompt is no longer available.",
      });
      setPrompt(entry.prompt);
      return;
    }

    setSelectedProviderId(provider.id);
    setPrompt(entry.prompt);
    void sendPrompt(entry.prompt, provider, {
      ...DEFAULT_PROMPT_INPUT_PREFERENCES,
      clearOnSubmit: false,
      focusAfterSubmit: false,
      allowSubmitWhileSending: false,
    });
  }

  async function sendPrompt(
    promptOverride?: string,
    providerOverride?: ProviderConfig,
    options: PromptInputPreferences = DEFAULT_PROMPT_INPUT_PREFERENCES,
  ) {
    if (!isTauriRuntime) {
      setReplyError(localValidationError(BROWSER_PREVIEW_MESSAGE));
      setChatStatus({
        tone: "warning",
        message: BROWSER_PREVIEW_MESSAGE,
      });
      return;
    }

    if (isSending && !options.allowSubmitWhileSending) {
      const error = localValidationError("Wait for the current response before sending again.");
      setReplyError(error);
      setChatStatus({
        tone: "warning",
        message: error.message,
      });
      return;
    }

    const targetPrompt = promptOverride ?? prompt;
    const targetProvider = providerOverride ?? selectedProvider;

    if (!targetProvider) {
      const error = localValidationError("Select a provider before sending.");
      setReplyError(error);
      setChatStatus({
        tone: "warning",
        message: error.message,
      });
      openSettings("providers");
      return;
    }
    if (!targetPrompt.trim()) {
      const error = localValidationError("Prompt is empty.");
      setReplyError(error);
      setChatStatus({
        tone: "warning",
        message: error.message,
      });
      return;
    }

    const hasLocalExcerpts = attachedFiles.some((file) => Boolean(file.textContent));
    if (providerIsCloud(targetProvider.kind) && hasLocalExcerpts && !cloudContextReviewAccepted) {
      setCloudContextReviewAccepted(true);
      setChatStatus({
        tone: "warning",
        message:
          "Local document excerpts may be included in prompts sent to the selected provider. Review the context before sending sensitive data. Press send again to continue.",
      });
      return;
    }

    setPendingSendCount((current) => current + 1);
    setReplyError(null);

    try {
      const withAttachments = buildPromptWithAttachments(targetPrompt, attachedFiles);
      const result = await sendProviderPrompt(withAttachments.preparedPrompt, targetProvider);
      if (result.status === "success") {
        addSessionEntry({
          id: makeSessionEntryId(),
          prompt: targetPrompt,
          createdAt: new Date().toISOString(),
          providerId: targetProvider.id,
          providerName: result.data.provider,
          model: result.data.model,
          response: result.data.content,
        });
        if (promptOverride === undefined && options.clearOnSubmit) {
          setPrompt("");
        }
        setAttachedFiles([]);
        setCloudContextReviewAccepted(false);
        setChatStatus({
          tone: "success",
          message:
            withAttachments.attachmentCount > 0
              ? `Responded with ${result.data.provider} / ${result.data.model} using ${withAttachments.attachmentCount} attachment(s).`
              : `Responded with ${result.data.provider} / ${result.data.model}.`,
        });
      } else {
        setReplyError(result.error);
        addSessionEntry({
          id: makeSessionEntryId(),
          prompt: targetPrompt,
          createdAt: new Date().toISOString(),
          providerId: targetProvider.id,
          providerName: targetProvider.name,
          model: targetProvider.model,
          error: result.error.message,
        });
        setChatStatus({
          tone: toneForProviderError(result.error),
          message: result.error.retryable
            ? "Provider request failed. Adjust settings and retry."
            : "Provider request failed. Inspect provider state before retrying.",
        });
      }
    } catch (err) {
      const error = localValidationError(err instanceof Error ? err.message : String(err));
      setReplyError(error);
      setChatStatus({
        tone: "error",
        message: error.message,
      });
    } finally {
      setPendingSendCount((current) => Math.max(0, current - 1));
      if (options.focusAfterSubmit) {
        promptRef.current?.focus();
      }
      if (attachedFiles.length === 0) {
        setCloudContextReviewAccepted(false);
      }
    }
  }

  function requestPromptSubmit() {
    void sendPrompt(undefined, undefined, inputPreferences);
  }

  async function handleAttachFiles(fileList: FileList | File[]) {
    const nextFiles = Array.from(fileList);
    if (nextFiles.length === 0) {
      return;
    }

    const loaded = await Promise.all(nextFiles.map((file) => readAttachedPromptFile(file)));
    setAttachedFiles((current) => [...current, ...loaded]);
    setCloudContextReviewAccepted(false);
    setChatStatus({
      tone: "neutral",
      message: `${loaded.length} attachment(s) added to the next prompt.`,
    });
  }

  async function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (!event.currentTarget.files) {
      return;
    }

    await handleAttachFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  function removeAttachment(id: string) {
    setAttachedFiles((current) => current.filter((file) => file.id !== id));
    setCloudContextReviewAccepted(false);
  }

  function onComposerDragOver(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDraggingFiles(true);
  }

  function onComposerDragLeave(event: DragEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingFiles(false);
    }
  }

  async function onComposerDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDraggingFiles(false);
    if (event.dataTransfer.files.length === 0) {
      return;
    }

    await handleAttachFiles(event.dataTransfer.files);
  }

  const selectedProviderLabel = selectedProvider
    ? `${selectedProvider.model || "model not set"} / ${selectedProvider.name}`
    : "Set up a model";

  return (
    <>
      {!isSettingsWindow ? (
      <main className="shell">
        <div className="window-shell">
          <AppChrome
            title="PilotBell"
            isMaximized={isWindowMaximized}
            onOpenSettings={() => openSettings("providers")}
            onStartDrag={() => void startWindowDrag()}
            onMinimize={() => void minimizeWindow()}
            onToggleMaximize={() => void toggleMaximizeWindow()}
            onClose={() => void closeWindow()}
            SettingsIcon={SettingsIcon}
            MinusIcon={MinusIcon}
            MaximizeIcon={SquareIcon}
            RestoreIcon={RestoreIcon}
            CloseIcon={CloseIcon}
          />

          <section className="workspace">
            <div className={chatEntries.length === 0 ? "chat-surface empty-session" : "chat-surface"}>
              <SessionHistory
                entries={chatEntries}
                isSending={isSending}
                isTauriRuntime={isTauriRuntime}
                formatSessionTime={formatSessionTime}
                onRetry={retrySessionEntry}
                onCopy={(text, label) => void copyText(text, label)}
              />

              <PromptComposer
                prompt={prompt}
                setPrompt={setPrompt}
                attachedFiles={attachedFiles}
                isDraggingFiles={isDraggingFiles}
                isSending={isSending}
                isTauriRuntime={isTauriRuntime}
                isMigratingProviders={isMigratingProviders}
                isProviderActionsDisabled={isProviderActionsDisabled}
                isTestingProvider={isTestingProvider}
                shouldPromptInitialSetup={shouldPromptInitialSetup}
                selectedProvider={selectedProvider}
                selectedProviderId={selectedProviderId}
                selectedProviderLabel={selectedProviderLabel}
                selectedProviderHealth={selectedProviderHealth}
                providers={providers}
                providerHealthRecords={providerHealthRecords}
                providerMenuOpen={providerMenuOpen}
                sessionEntryCount={sessionEntries.length}
                fileInputRef={fileInputRef}
                promptRef={promptRef}
                providerMenuRef={providerMenuRef}
                inputPreferences={inputPreferences}
                icons={{
                  Attach: AttachIcon,
                  ArrowUp: ArrowUpIcon,
                  ChevronDown: ChevronDownIcon,
                  Close: CloseIcon,
                }}
                formatBytes={formatBytes}
                readinessLabel={readinessLabel}
                setProviderMenuOpen={setProviderMenuOpen}
                setSelectedProviderId={setSelectedProviderId}
                onSubmitPrompt={requestPromptSubmit}
                onFileInputChange={(event) => void onFileInputChange(event)}
                onDragOver={onComposerDragOver}
                onDragLeave={onComposerDragLeave}
                onDrop={(event) => void onComposerDrop(event)}
                removeAttachment={removeAttachment}
                openProviderSettings={() => openSettings("providers")}
                testProvider={() => void testProvider()}
                clearSession={clearSession}
              />

              {chatStatus ? (
                <div className={`notice notice-${chatStatus.tone}`}>
                  <span>{chatStatus.message}</span>
                  {chatStatus.dismissKey === "global-shortcut" ? (
                    <button
                      type="button"
                      className="notice-dismiss"
                      onClick={dismissGlobalShortcutNotice}
                    >
                      Hide next time
                    </button>
                  ) : null}
                </div>
              ) : null}
              {replyError?.details ? <pre className="detail">{replyError.details}</pre> : null}
            </div>
          </section>
        </div>
      </main>
      ) : null}

      <SettingsPanel
        isOpen={isSettingsWindow || shouldShowSettings}
        mode={isSettingsWindow ? "window" : "overlay"}
        shouldPromptInitialSetup={shouldPromptInitialSetup}
        activeSection={settingsSection}
        onSectionChange={setSettingsSection}
        onClose={isSettingsWindow ? () => void closeWindow() : closeSettings}
        onStartDrag={() => void startWindowDrag()}
        onMinimize={() => void minimizeWindow()}
        onToggleMaximize={() => void toggleMaximizeWindow()}
        panelRef={settingsPanelRef}
        isMaximized={isWindowMaximized}
        themePreference={themePreference}
        resolvedTheme={resolvedTheme}
        themeOptions={THEME_OPTIONS}
        onThemeChange={persistThemePreference}
        MinusIcon={MinusIcon}
        MaximizeIcon={SquareIcon}
        RestoreIcon={RestoreIcon}
        CloseIcon={CloseIcon}
      >
        {settingsSection === "providers" ? (
              <ProviderSettingsSection
                inputPreferences={inputPreferences}
                updateInputPreferences={updateInputPreferences}
                providerDraft={providerDraft}
                setProviderDraft={setProviderDraft}
                providerDraftRequiresApiKey={providerDraftRequiresApiKey}
                providerEndpointRisk={providerEndpointRisk}
                editingProvider={editingProvider}
                providers={providers}
                providerHealthRecords={providerHealthRecords}
                selectedProvider={selectedProvider}
                selectedProviderHealth={selectedProviderHealth}
                selectedProviderId={selectedProviderId}
                providerStatus={providerStatus}
                isProviderActionsDisabled={isProviderActionsDisabled}
                isTauriRuntime={isTauriRuntime}
                isSavingProvider={isSavingProvider}
                isMigratingProviders={isMigratingProviders}
                isTestingProvider={isTestingProvider}
                removingProviderId={removingProviderId}
                formatRelativeTime={formatRelativeTime}
                readinessLabel={readinessLabel}
                applyOpenAIPreset={applyOpenAIPreset}
                applyAnthropicPreset={applyAnthropicPreset}
                applyOllamaPreset={applyOllamaPreset}
                applyLlamaCppPreset={applyLlamaCppPreset}
                addProvider={addProvider}
                updateProvider={updateProvider}
                cancelProviderEdit={cancelProviderEdit}
                setSelectedProviderId={setSelectedProviderId}
                beginEditProvider={beginEditProvider}
                removeProvider={removeProvider}
                testProvider={testProvider}
                diagnoseSelectedProviderSecret={diagnoseSelectedProviderSecret}
                repairSelectedProviderSecretMetadata={repairSelectedProviderSecretMetadata}
                deleteSelectedProviderSecretOnly={deleteSelectedProviderSecretOnly}
              />
            ) : settingsSection === "documents" ? (
              <DocumentWorkflowPanel
                draft={documentJobs.draft}
                setDraft={documentJobs.setDraft}
                jobs={documentJobs.jobs}
                providers={providers}
                progress={documentJobs.activeProgress ?? documentJobs.latestProgress}
                statusMessage={documentJobs.statusMessage}
                isRunning={documentJobs.isRunning}
                isTauriRuntime={isTauriRuntime}
                onStart={() => void documentJobs.startJob()}
                onCancel={() => void documentJobs.cancelActiveJob()}
                onClear={documentJobs.clearJobs}
              />
            ) : (
              <SourceSettingsSection
                sourceDraft={sourceDraft}
                setSourceDraft={setSourceDraft}
                editingSource={editingSource}
                localSources={localSources}
                sourceStatus={sourceStatus}
                isTauriRuntime={isTauriRuntime}
                isSourceActionsDisabled={isSourceActionsDisabled}
                removingSourceId={removingSourceId}
                saveSource={saveSource}
                cancelSourceEdit={cancelSourceEdit}
                beginEditSource={beginEditSource}
                removeSource={removeSource}
              />
            )}
      </SettingsPanel>
    </>
  );
}

export default App;
