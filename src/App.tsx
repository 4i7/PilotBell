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
import {
  ANTHROPIC_PROVIDER_KIND,
  DEFAULT_PROVIDER_KIND,
  LLAMA_CPP_PROVIDER_KIND,
  OLLAMA_PROVIDER_KIND,
  type ProviderConfig,
  type ProviderDraft,
  classifyProviderEndpoint,
  isProviderDraftValid,
  makeProviderId,
  normalizeProviderDraft,
  providerIsCloud,
  providerRequiresApiKey,
} from "./domain/provider";
import {
  DIRECTORY_SOURCE_KIND,
  type LocalSource,
  type LocalSourceDraft,
  isLocalSourceDraftValid,
  makeLocalSourceId,
  normalizeLocalSourceDraft,
} from "./domain/source";
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
import {
  loadPromptInputPreferences,
  savePromptInputPreferences,
} from "./lib/inputPreferenceStore";
import { loadProviderState, saveProviders } from "./lib/providerStore";
import {
  type PromptSessionEntry,
  loadPromptSession,
  savePromptSession,
} from "./lib/sessionStore";
import { formatBytes, formatRelativeTime, formatSessionTime } from "./lib/formatters";
import { loadLocalSources, saveLocalSources } from "./lib/sourceStore";
import { buildPromptWithAttachments, readAttachedPromptFile } from "./lib/promptAttachments";
import {
  type ProviderHealthRecord,
  type ProviderReadiness,
  loadProviderHealthRecords,
  saveProviderHealthRecords,
} from "./lib/providerHealthStore";
import {
  type ResolvedTheme,
  type ThemePreference,
  loadThemePreference,
  resolveThemePreference,
  saveThemePreference,
} from "./lib/themeStore";
import "./App.css";

type AssistantReply = {
  content: string;
  provider: string;
  model: string;
};

type ProviderErrorKind =
  | "validation"
  | "secret_store"
  | "timeout"
  | "network"
  | "provider"
  | "response_format"
  | "internal";

type ProviderCommandError = {
  kind: ProviderErrorKind;
  message: string;
  statusCode?: number | null;
  retryable: boolean;
  details?: string | null;
};

type ProviderHealth = {
  message: string;
};

type ProviderSecretStatus = {
  providerId: string;
  message: string;
};

type ProviderSecretDiagnosis = {
  providerId: string;
  hasSecret: boolean;
  message: string;
};

type CommandResult<T> =
  | {
      status: "success";
      data: T;
    }
  | {
      status: "error";
      error: ProviderCommandError;
    };

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

const DEFAULT_PROVIDER_DRAFT: ProviderDraft = {
  kind: DEFAULT_PROVIDER_KIND,
  name: "OpenAI",
  endpoint: "https://api.openai.com/v1/responses",
  apiKey: "",
  model: "",
  advancedEndpoint: false,
};

const OLLAMA_PROVIDER_DRAFT: ProviderDraft = {
  kind: OLLAMA_PROVIDER_KIND,
  name: "Ollama",
  endpoint: "http://127.0.0.1:11434/api/generate",
  apiKey: "",
  model: "llama3.2",
  advancedEndpoint: false,
};

const ANTHROPIC_PROVIDER_DRAFT: ProviderDraft = {
  kind: ANTHROPIC_PROVIDER_KIND,
  name: "Anthropic",
  endpoint: "https://api.anthropic.com/v1/messages",
  apiKey: "",
  model: "claude-sonnet-4-20250514",
  advancedEndpoint: false,
};

const LLAMA_CPP_PROVIDER_DRAFT: ProviderDraft = {
  kind: LLAMA_CPP_PROVIDER_KIND,
  name: "llama.cpp",
  endpoint: "http://127.0.0.1:8080/v1/chat/completions",
  apiKey: "",
  model: "local-llama",
  advancedEndpoint: false,
};

const DEFAULT_LOCAL_SOURCE_DRAFT: LocalSourceDraft = {
  kind: DIRECTORY_SOURCE_KIND,
  name: "",
  path: "",
  notes: "",
};

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
  const [initialProviderState] = useState(() => loadProviderState());
  const [prompt, setPrompt] = useState("");
  const [replyError, setReplyError] = useState<ProviderCommandError | null>(null);
  const [shellState, setShellState] = useState<AppShellState | null>(null);
  const [sessionEntries, setSessionEntries] = useState<PromptSessionEntry[]>(() =>
    loadPromptSession(),
  );
  const [providerHealthRecords, setProviderHealthRecords] = useState<
    Record<string, ProviderHealthRecord>
  >(() => loadProviderHealthRecords());
  const [pendingSendCount, setPendingSendCount] = useState(0);
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [isMigratingProviders, setIsMigratingProviders] = useState(
    initialProviderState.legacyProviders.length > 0,
  );
  const [removingProviderId, setRemovingProviderId] = useState("");
  const [providerStatus, setProviderStatus] = useState<InlineStatus | null>(null);
  const [sourceStatus, setSourceStatus] = useState<InlineStatus | null>(null);
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

  const [providers, setProviders] = useState<ProviderConfig[]>(initialProviderState.providers);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [editingProviderId, setEditingProviderId] = useState("");
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>({ ...DEFAULT_PROVIDER_DRAFT });
  const [localSources, setLocalSources] = useState<LocalSource[]>(() => loadLocalSources());
  const [editingSourceId, setEditingSourceId] = useState("");
  const [removingSourceId, setRemovingSourceId] = useState("");
  const [sourceDraft, setSourceDraft] = useState<LocalSourceDraft>({
    ...DEFAULT_LOCAL_SOURCE_DRAFT,
  });

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );
  const editingProvider = useMemo(
    () => providers.find((provider) => provider.id === editingProviderId) ?? null,
    [providers, editingProviderId],
  );
  const editingSource = useMemo(
    () => localSources.find((source) => source.id === editingSourceId) ?? null,
    [localSources, editingSourceId],
  );
  const selectedProviderHealth = selectedProvider
    ? providerHealthRecords[selectedProvider.id] ?? null
    : null;
  const providerDraftRequiresApiKey = providerRequiresApiKey(providerDraft.kind);
  const isTauriRuntime = useMemo(() => hasTauriRuntime(), []);
  const isSettingsWindow = useMemo(() => isSettingsWindowView(), []);
  const documentJobs = useDocumentJobs(isTauriRuntime);
  const resolvedTheme = resolveThemePreference(themePreference, systemTheme);
  const isSending = pendingSendCount > 0;
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const chatEntries = useMemo(() => [...sessionEntries].reverse(), [sessionEntries]);
  const hasReadyProvider = useMemo(
    () =>
      providers.some((provider) => providerHealthRecords[provider.id]?.readiness === "ready"),
    [providerHealthRecords, providers],
  );
  const hasSuccessfulSession = useMemo(
    () => sessionEntries.some((entry) => Boolean(entry.response)),
    [sessionEntries],
  );
  const shouldPromptInitialSetup = !hasReadyProvider && !hasSuccessfulSession;
  const shouldShowSettings = settingsOpen;
  const isProviderActionsDisabled =
    isMigratingProviders || isSavingProvider || removingProviderId.length > 0;
  const isSourceActionsDisabled = removingSourceId.length > 0;
  const providerEndpointRisk = classifyProviderEndpoint(providerDraft.kind, providerDraft.endpoint);

  function persistProviders(next: ProviderConfig[]) {
    setProviders(next);
    saveProviders(next);
  }

  function persistLocalSources(next: LocalSource[]) {
    setLocalSources(next);
    saveLocalSources(next);
  }

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

  function updateProviderHealthRecord(record: ProviderHealthRecord) {
    setProviderHealthRecords((current) => {
      const next = {
        ...current,
        [record.providerId]: record,
      };
      saveProviderHealthRecords(next);
      return next;
    });
  }

  function removeProviderHealthRecord(providerId: string) {
    setProviderHealthRecords((current) => {
      const next = { ...current };
      delete next[providerId];
      saveProviderHealthRecords(next);
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

  async function storeProviderSecret(providerId: string, apiKey: string) {
    return invoke<CommandResult<ProviderSecretStatus>>("store_provider_secret", {
      input: {
        providerId,
        apiKey,
      },
    });
  }

  async function deleteProviderSecret(providerId: string) {
    return invoke<CommandResult<ProviderSecretStatus>>("delete_provider_secret", {
      providerId,
    });
  }

  async function diagnoseProviderSecret(providerId: string) {
    return invoke<CommandResult<ProviderSecretDiagnosis>>("diagnose_provider_secret", {
      providerId,
    });
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
      setProviderStatus({
        tone: "warning",
        message: BROWSER_PREVIEW_MESSAGE,
      });
      setSourceStatus({
        tone: "warning",
        message: BROWSER_PREVIEW_MESSAGE,
      });
      setChatStatus({
        tone: "warning",
        message: BROWSER_PREVIEW_MESSAGE,
      });
      setIsMigratingProviders(false);
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

  useEffect(() => {
    if (!isTauriRuntime) {
      return;
    }

    if (initialProviderState.legacyProviders.length === 0) {
      return;
    }

    let cancelled = false;

    async function rollbackSecrets(providerIds: string[]) {
      await Promise.allSettled(providerIds.map((providerId) => deleteProviderSecret(providerId)));
    }

    async function migrateLegacyProviders() {
      setProviderStatus({
        tone: "neutral",
        message: `Migrating ${initialProviderState.legacyProviders.length} existing provider secret(s) into the OS credential store...`,
      });

      const migratedProviders: ProviderConfig[] = [];
      const storedProviderIds: string[] = [];

      for (const provider of initialProviderState.legacyProviders) {
        const result = await storeProviderSecret(provider.id, provider.apiKey);
        if (result.status === "error") {
          await rollbackSecrets(storedProviderIds);
          if (!cancelled) {
            setProviderStatus({
              tone: toneForProviderError(result.error),
              message:
                "Legacy provider migration failed. Browser-stored providers were left unchanged. Resolve credential-store access and restart PilotBell.",
            });
            setIsMigratingProviders(false);
          }
          return;
        }

        storedProviderIds.push(provider.id);
        migratedProviders.push({
          id: provider.id,
          kind: provider.kind ?? DEFAULT_PROVIDER_KIND,
          name: provider.name,
          endpoint: provider.endpoint,
          model: provider.model,
          hasSecret: true,
          advancedEndpoint: provider.advancedEndpoint ?? false,
        });
      }

      if (cancelled) {
        await rollbackSecrets(storedProviderIds);
        return;
      }

      setProviders((current) => {
        const next = [...current, ...migratedProviders];
        saveProviders(next);
        return next;
      });
      setProviderStatus({
        tone: "success",
        message: `Migrated ${migratedProviders.length} provider secret(s) into the OS credential store.`,
      });
      setIsMigratingProviders(false);
    }

    void migrateLegacyProviders();

    return () => {
      cancelled = true;
    };
  }, [initialProviderState.legacyProviders, isTauriRuntime]);

  function applyOpenAIPreset() {
    setProviderDraft((current) => ({
      ...current,
      ...DEFAULT_PROVIDER_DRAFT,
      name:
        current.name.trim() && current.kind === DEFAULT_PROVIDER_KIND
          ? current.name
          : DEFAULT_PROVIDER_DRAFT.name,
      model:
        current.model.trim() && current.kind === DEFAULT_PROVIDER_KIND
          ? current.model
          : DEFAULT_PROVIDER_DRAFT.model,
    }));
  }

  function applyAnthropicPreset() {
    setProviderDraft((current) => ({
      ...current,
      ...ANTHROPIC_PROVIDER_DRAFT,
      name:
        current.name.trim() && current.kind === ANTHROPIC_PROVIDER_KIND
          ? current.name
          : ANTHROPIC_PROVIDER_DRAFT.name,
      model:
        current.model.trim() && current.kind === ANTHROPIC_PROVIDER_KIND
          ? current.model
          : ANTHROPIC_PROVIDER_DRAFT.model,
    }));
  }

  function applyOllamaPreset() {
    setProviderDraft((current) => ({
      ...current,
      ...OLLAMA_PROVIDER_DRAFT,
      name: current.name.trim() && current.kind === OLLAMA_PROVIDER_KIND ? current.name : "Ollama",
      model:
        current.model.trim() && current.kind === OLLAMA_PROVIDER_KIND
          ? current.model
          : OLLAMA_PROVIDER_DRAFT.model,
    }));
  }

  function applyLlamaCppPreset() {
    setProviderDraft((current) => ({
      ...current,
      ...LLAMA_CPP_PROVIDER_DRAFT,
      name:
        current.name.trim() && current.kind === LLAMA_CPP_PROVIDER_KIND
          ? current.name
          : LLAMA_CPP_PROVIDER_DRAFT.name,
      model:
        current.model.trim() && current.kind === LLAMA_CPP_PROVIDER_KIND
          ? current.model
          : LLAMA_CPP_PROVIDER_DRAFT.model,
    }));
  }

  function resetProviderDraft() {
    setEditingProviderId("");
    setProviderDraft({ ...DEFAULT_PROVIDER_DRAFT });
  }

  function beginEditProvider(provider: ProviderConfig) {
    setSelectedProviderId(provider.id);
    setEditingProviderId(provider.id);
    setProviderDraft({
      kind: provider.kind,
      name: provider.name,
      endpoint: provider.endpoint,
      apiKey: "",
      model: provider.model,
      advancedEndpoint: provider.advancedEndpoint,
    });
    setProviderStatus({
      tone: "neutral",
      message: providerRequiresApiKey(provider.kind)
        ? `Editing ${provider.name}. Leave API key blank to keep the stored secret when the provider type stays the same.`
        : `Editing ${provider.name}. This provider does not use an API key.`,
    });
    openSettings("providers");
  }

  function cancelProviderEdit() {
    resetProviderDraft();
    setProviderStatus({
      tone: "neutral",
      message: "Provider editing cancelled.",
    });
  }

  async function addProvider() {
    if (!isTauriRuntime) {
      setProviderStatus({
        tone: "warning",
        message: BROWSER_PREVIEW_MESSAGE,
      });
      return;
    }

    const normalized = normalizeProviderDraft(providerDraft);
    const requiresApiKey = providerRequiresApiKey(normalized.kind);
    const endpointRisk = classifyProviderEndpoint(normalized.kind, normalized.endpoint);
    if (!isProviderDraftValid(normalized, { requireApiKey: requiresApiKey })) {
      setProviderStatus({
        tone: "warning",
        message: requiresApiKey
          ? "Provider registration failed: all fields are required."
          : "Provider registration failed: type, name, endpoint, and model are required.",
      });
      return;
    }

    if (endpointRisk.isAdvanced && !normalized.advancedEndpoint) {
      setProviderStatus({
        tone: "warning",
        message: `${endpointRisk.message} Enable advanced endpoint mode to save this provider.`,
      });
      return;
    }

    const nextProvider: ProviderConfig = {
      id: makeProviderId(),
      kind: normalized.kind,
      name: normalized.name,
      endpoint: normalized.endpoint,
      model: normalized.model,
      hasSecret: requiresApiKey,
      advancedEndpoint: normalized.advancedEndpoint,
    };

    setIsSavingProvider(true);
    setProviderStatus({
      tone: "neutral",
      message: requiresApiKey
        ? `Saving ${nextProvider.name} into the OS credential store...`
        : `Saving ${nextProvider.name} as a local provider...`,
    });

    try {
      if (requiresApiKey) {
        const secretResult = await storeProviderSecret(nextProvider.id, normalized.apiKey);
        if (secretResult.status === "error") {
          setProviderStatus({
            tone: toneForProviderError(secretResult.error),
            message: secretResult.error.message,
          });
          return;
        }
      }

      const next = [...providers, nextProvider];
      persistProviders(next);
      setSelectedProviderId(nextProvider.id);
      setProviderDraft({ ...DEFAULT_PROVIDER_DRAFT });
      setProviderStatus({
        tone: "success",
        message: requiresApiKey
          ? `Saved ${nextProvider.name}. Metadata stays in PilotBell, and the API key now lives in the OS credential store.`
          : `Saved ${nextProvider.name}. Local provider metadata stays in PilotBell; no API key was stored.`,
      });
    } catch (err) {
      setProviderStatus({
        tone: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSavingProvider(false);
    }
  }

  async function updateProvider() {
    if (!isTauriRuntime) {
      setProviderStatus({
        tone: "warning",
        message: BROWSER_PREVIEW_MESSAGE,
      });
      return;
    }

    if (!editingProvider) {
      setProviderStatus({
        tone: "warning",
        message: "Select a provider before editing.",
      });
      return;
    }

    const normalized = normalizeProviderDraft(providerDraft);
    const requiresApiKey = providerRequiresApiKey(normalized.kind);
    const endpointRisk = classifyProviderEndpoint(normalized.kind, normalized.endpoint);
    const hostedProviderKindChanged =
      editingProvider.kind !== normalized.kind &&
      providerRequiresApiKey(editingProvider.kind) &&
      requiresApiKey;
    if (!isProviderDraftValid(normalized, { requireApiKey: false })) {
      setProviderStatus({
        tone: "warning",
        message: "Provider update failed: type, name, endpoint, and model are required.",
      });
      return;
    }

    if (requiresApiKey && !editingProvider.hasSecret && !normalized.apiKey) {
      setProviderStatus({
        tone: "warning",
        message: "Provider update failed: API key is required because no stored secret exists.",
      });
      return;
    }

    if (hostedProviderKindChanged && !normalized.apiKey) {
      setProviderStatus({
        tone: "warning",
        message: "Provider update failed: switching hosted provider types requires a new API key.",
      });
      return;
    }

    if (endpointRisk.isAdvanced && !normalized.advancedEndpoint) {
      setProviderStatus({
        tone: "warning",
        message: `${endpointRisk.message} Enable advanced endpoint mode before updating this provider.`,
      });
      return;
    }

    const nextProvider: ProviderConfig = {
      id: editingProvider.id,
      kind: normalized.kind,
      name: normalized.name,
      endpoint: normalized.endpoint,
      model: normalized.model,
      hasSecret: requiresApiKey
        ? hostedProviderKindChanged
          ? Boolean(normalized.apiKey)
          : editingProvider.hasSecret || Boolean(normalized.apiKey)
        : false,
      advancedEndpoint: normalized.advancedEndpoint,
    };

    setIsSavingProvider(true);
    setProviderStatus({
      tone: "neutral",
      message: `Updating ${nextProvider.name}...`,
    });

    try {
      if (requiresApiKey && normalized.apiKey) {
        const secretResult = await storeProviderSecret(nextProvider.id, normalized.apiKey);
        if (secretResult.status === "error") {
          setProviderStatus({
            tone: toneForProviderError(secretResult.error),
            message: secretResult.error.message,
          });
          return;
        }
      }

      if (!requiresApiKey && editingProvider.hasSecret) {
        const deleteResult = await deleteProviderSecret(nextProvider.id);
        if (deleteResult.status === "error") {
          setProviderStatus({
            tone: toneForProviderError(deleteResult.error),
            message: deleteResult.error.message,
          });
          return;
        }
      }

      const next = providers.map((provider) =>
        provider.id === nextProvider.id ? nextProvider : provider,
      );
      persistProviders(next);
      setSelectedProviderId(nextProvider.id);
      removeProviderHealthRecord(nextProvider.id);
      resetProviderDraft();
      setProviderStatus({
        tone: "success",
        message: !requiresApiKey
          ? `Updated ${nextProvider.name}. No API key is required for this provider. Run Test API to refresh readiness.`
          : hostedProviderKindChanged
            ? `Updated ${nextProvider.name} and stored a new API key for the new provider type. Run Test API to refresh readiness.`
            : normalized.apiKey
              ? `Updated ${nextProvider.name} and replaced its stored API key. Run Test API to refresh readiness.`
              : `Updated ${nextProvider.name}. Stored API key was kept. Run Test API to refresh readiness.`,
      });
    } catch (err) {
      setProviderStatus({
        tone: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSavingProvider(false);
    }
  }

  async function removeProvider(id: string) {
    if (!isTauriRuntime) {
      setProviderStatus({
        tone: "warning",
        message: BROWSER_PREVIEW_MESSAGE,
      });
      return;
    }

    setRemovingProviderId(id);

    try {
      const result = await deleteProviderSecret(id);
      if (result.status === "error") {
        setProviderStatus({
          tone: toneForProviderError(result.error),
          message: result.error.message,
        });
        return;
      }

      const next = providers.filter((provider) => provider.id !== id);
      persistProviders(next);
      removeProviderHealthRecord(id);
      if (selectedProviderId === id) {
        setSelectedProviderId("");
      }
      if (editingProviderId === id) {
        resetProviderDraft();
      }
      setProviderStatus({
        tone: "neutral",
        message: "Provider metadata and stored secret were removed.",
      });
    } catch (err) {
      setProviderStatus({
        tone: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRemovingProviderId("");
    }
  }

  async function diagnoseSelectedProviderSecret() {
    if (!selectedProvider || !providerRequiresApiKey(selectedProvider.kind)) {
      setProviderStatus({
        tone: "neutral",
        message: "Selected provider does not use a stored secret.",
      });
      return;
    }

    const result = await diagnoseProviderSecret(selectedProvider.id);
    if (result.status === "error") {
      setProviderStatus({
        tone: toneForProviderError(result.error),
        message: result.error.message,
      });
      return;
    }

    setProviderStatus({
      tone: result.data.hasSecret ? "success" : "warning",
      message: result.data.message,
    });
  }

  async function repairSelectedProviderSecretMetadata() {
    if (!selectedProvider || !providerRequiresApiKey(selectedProvider.kind)) {
      return;
    }

    const result = await diagnoseProviderSecret(selectedProvider.id);
    if (result.status === "error") {
      setProviderStatus({
        tone: toneForProviderError(result.error),
        message: result.error.message,
      });
      return;
    }

    const next = providers.map((provider) =>
      provider.id === selectedProvider.id
        ? { ...provider, hasSecret: result.data.hasSecret }
        : provider,
    );
    persistProviders(next);
    removeProviderHealthRecord(selectedProvider.id);
    setProviderStatus({
      tone: result.data.hasSecret ? "success" : "warning",
      message: result.data.hasSecret
        ? "Provider metadata repaired: stored secret is present."
        : "Provider metadata repaired: stored secret is missing. Re-save the API key.",
    });
  }

  async function deleteSelectedProviderSecretOnly() {
    if (!selectedProvider || !providerRequiresApiKey(selectedProvider.kind)) {
      return;
    }

    const result = await deleteProviderSecret(selectedProvider.id);
    if (result.status === "error") {
      setProviderStatus({
        tone: toneForProviderError(result.error),
        message: result.error.message,
      });
      return;
    }

    const next = providers.map((provider) =>
      provider.id === selectedProvider.id ? { ...provider, hasSecret: false } : provider,
    );
    persistProviders(next);
    removeProviderHealthRecord(selectedProvider.id);
    setProviderStatus({
      tone: "warning",
      message: "Stored secret deleted. Re-save the API key before testing this provider.",
    });
  }

  function resetSourceDraft() {
    setEditingSourceId("");
    setSourceDraft({ ...DEFAULT_LOCAL_SOURCE_DRAFT });
  }

  function beginEditSource(source: LocalSource) {
    setEditingSourceId(source.id);
    setSourceDraft({
      kind: source.kind,
      name: source.name,
      path: source.path,
      notes: source.notes ?? "",
    });
    setSourceStatus({
      tone: "neutral",
      message: `Editing ${source.name}. Update the path metadata and save when ready.`,
    });
    openSettings("sources");
  }

  function cancelSourceEdit() {
    resetSourceDraft();
    setSourceStatus({
      tone: "neutral",
      message: "Source editing cancelled.",
    });
  }

  function saveSource() {
    const normalized = normalizeLocalSourceDraft(sourceDraft);
    if (!isLocalSourceDraftValid(normalized)) {
      setSourceStatus({
        tone: "warning",
        message: "Source registration failed: name and path are required.",
      });
      return;
    }

    const nextSource: LocalSource = {
      id: editingSource?.id ?? makeLocalSourceId(),
      kind: normalized.kind,
      name: normalized.name,
      path: normalized.path,
      notes: normalized.notes || undefined,
    };

    if (editingSource) {
      persistLocalSources(
        localSources.map((source) => (source.id === nextSource.id ? nextSource : source)),
      );
      setSourceStatus({
        tone: "success",
        message: `Updated ${nextSource.name}. Source registration is deprecated for new document workflows.`,
      });
    } else {
      persistLocalSources([nextSource, ...localSources]);
      setSourceStatus({
        tone: "success",
        message: `Registered ${nextSource.name}. New document workflows use selected files instead of a persistent index.`,
      });
    }

    resetSourceDraft();
  }

  function removeSource(id: string) {
    setRemovingSourceId(id);
    const next = localSources.filter((source) => source.id !== id);
    persistLocalSources(next);
    if (editingSourceId === id) {
      resetSourceDraft();
    }
    setSourceStatus({
      tone: "neutral",
      message: "Local source registration removed.",
    });
    setRemovingSourceId("");
  }

  async function testProvider() {
    if (!isTauriRuntime) {
      setProviderStatus({
        tone: "warning",
        message: BROWSER_PREVIEW_MESSAGE,
      });
      return;
    }

    if (!selectedProvider) {
      setProviderStatus({
        tone: "warning",
        message: "Select a provider before testing.",
      });
      return;
    }

    setIsTestingProvider(true);
    setProviderStatus({
      tone: "neutral",
      message: `Testing ${selectedProvider.name}...`,
    });

    try {
      const startedAt = performance.now();
      const result = await invoke<CommandResult<ProviderHealth>>("test_provider", {
        provider: selectedProvider,
      });
      const latencyMs = Math.round(performance.now() - startedAt);
      const checkedAt = new Date().toISOString();

      if (result.status === "success") {
        updateProviderHealthRecord({
          providerId: selectedProvider.id,
          readiness: "ready",
          checkedAt,
          latencyMs,
          message: result.data.message,
        });
        setProviderStatus({
          tone: "success",
          message: `${result.data.message} (${latencyMs} ms)`,
        });
      } else {
        updateProviderHealthRecord({
          providerId: selectedProvider.id,
          readiness: result.error.retryable ? "warning" : "error",
          checkedAt,
          latencyMs,
          message: result.error.message,
          errorKind: result.error.kind,
          statusCode: result.error.statusCode ?? undefined,
          retryable: result.error.retryable,
        });
        setProviderStatus({
          tone: toneForProviderError(result.error),
          message: result.error.message,
        });
      }
    } catch (err) {
      setProviderStatus({
        tone: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTestingProvider(false);
    }
  }

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
      const result = await invoke<CommandResult<AssistantReply>>("handle_prompt", {
        prompt: withAttachments.preparedPrompt,
        provider: targetProvider,
      });
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
