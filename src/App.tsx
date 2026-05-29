import {
  type ChangeEvent,
  type DragEvent,
  type ReactElement,
  type SVGProps,
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
  type ProviderKind,
  classifyProviderEndpoint,
  getProviderCapabilities,
  isProviderDraftValid,
  makeProviderId,
  normalizeProviderDraft,
  officialEndpointForProvider,
  providerIsCloud,
  providerRequiresApiKey,
} from "./domain/provider";
import {
  DIRECTORY_SOURCE_KIND,
  FILE_SOURCE_KIND,
  type LocalSource,
  type LocalSourceDraft,
  type LocalSourceKind,
  isLocalSourceDraftValid,
  makeLocalSourceId,
  normalizeLocalSourceDraft,
} from "./domain/source";
import type { AttachedPromptFile } from "./domain/prompt";
import { DocumentWorkflowPanel } from "./components/DocumentWorkflowPanel";
import { PromptComposer } from "./components/PromptComposer";
import { SessionHistory } from "./components/SessionHistory";
import { useDocumentJobs } from "./hooks/useDocumentJobs";
import { loadProviderState, saveProviders } from "./lib/providerStore";
import {
  type PromptSessionEntry,
  loadPromptSession,
  savePromptSession,
} from "./lib/sessionStore";
import { loadLocalSources, saveLocalSources } from "./lib/sourceStore";
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
  icon: (props: SVGProps<SVGSVGElement>) => ReactElement;
}> = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];

const PROVIDER_KIND_OPTIONS: Array<{ value: ProviderKind; label: string }> = [
  { value: DEFAULT_PROVIDER_KIND, label: "OpenAI Responses" },
  { value: ANTHROPIC_PROVIDER_KIND, label: "Anthropic Messages" },
  { value: OLLAMA_PROVIDER_KIND, label: "Ollama" },
  { value: LLAMA_CPP_PROVIDER_KIND, label: "llama.cpp" },
];

const SOURCE_KIND_OPTIONS: Array<{ value: LocalSourceKind; label: string }> = [
  { value: DIRECTORY_SOURCE_KIND, label: "Directory" },
  { value: FILE_SOURCE_KIND, label: "File" },
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
const BROWSER_PREVIEW_MESSAGE =
  "Browser preview mode detected. PilotBell desktop features require `npm run tauri dev` or a packaged Tauri build.";
const MAX_ATTACHMENT_TEXT_BYTES = 200_000;
const MAX_ATTACHMENT_TEXT_CHARS = 8_000;

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

function providerKindLabel(kind: ProviderKind) {
  return PROVIDER_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
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

function makeAttachmentId() {
  return `attachment-${crypto.randomUUID()}`;
}

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(value: string) {
  const checkedAt = new Date(value).getTime();
  if (Number.isNaN(checkedAt)) {
    return "unknown";
  }

  const elapsedMs = Date.now() - checkedAt;
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60_000));
  if (elapsedMinutes < 1) {
    return "just now";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);
  return `${elapsedHours}h ago`;
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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

function buildPromptWithAttachments(prompt: string, files: AttachedPromptFile[]) {
  if (files.length === 0) {
    return {
      preparedPrompt: prompt,
      attachmentCount: 0,
    };
  }

  const attachmentBlock = files
    .map((file, index) => {
      const metadata = `${file.name} (${formatBytes(file.size)}${file.type ? `, ${file.type}` : ""})`;
      if (file.textContent) {
        return `[${index + 1}] ${metadata}\n${file.textContent}`;
      }

      return `[${index + 1}] ${metadata}\n${file.note ?? "Attachment added without extracted text content."}`;
    })
    .join("\n\n");

  return {
    preparedPrompt: `Use the following attached file context when it is relevant.\n\n${attachmentBlock}\n\nUser prompt:\n${prompt}`,
    attachmentCount: files.length,
  };
}

function extensionForFileName(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] ?? "" : "";
}

function isTextAttachment(file: File) {
  const extension = extensionForFileName(file.name);
  return (
    file.type.startsWith("text/") ||
    [
      "md",
      "txt",
      "json",
      "csv",
      "ts",
      "tsx",
      "js",
      "jsx",
      "py",
      "rs",
      "html",
      "css",
      "toml",
      "yaml",
      "yml",
      "xml",
    ].includes(extension)
  );
}

async function readAttachedPromptFile(file: File): Promise<AttachedPromptFile> {
  const attachment: AttachedPromptFile = {
    id: makeAttachmentId(),
    name: file.name,
    size: file.size,
    type: file.type,
  };

  const extension = extensionForFileName(file.name);
  if (extension === "pdf") {
    attachment.note =
      "PDF attached. Binary intake is wired, but PDF text extraction is not connected to the prompt pipeline yet.";
    return attachment;
  }

  if (!isTextAttachment(file)) {
    attachment.note = "Binary attachment added. Metadata is available, but text extraction is not active for this file type yet.";
    return attachment;
  }

  if (file.size > MAX_ATTACHMENT_TEXT_BYTES) {
    attachment.note =
      "Text attachment added, but it is too large for inline prompt injection. Only metadata was attached.";
    return attachment;
  }

  const rawText = (await file.text()).replace(/\r\n/g, "\n").trim();
  if (!rawText) {
    attachment.note = "Attachment was empty after text extraction.";
    return attachment;
  }

  attachment.textContent = rawText.slice(0, MAX_ATTACHMENT_TEXT_CHARS);
  if (rawText.length > MAX_ATTACHMENT_TEXT_CHARS) {
    attachment.note = "Attachment text was truncated before prompt injection.";
  }
  return attachment;
}

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z" />
      <path d="m19.4 15l1.1 1.9l-1.7 2.9l-2.2-.3a7.9 7.9 0 0 1-1.6.9L14.2 22h-4.4l-.8-1.6a7.9 7.9 0 0 1-1.6-.9l-2.2.3l-1.7-2.9L4.6 15a8.4 8.4 0 0 1 0-2l-1.1-1.9l1.7-2.9l2.2.3a7.9 7.9 0 0 1 1.6-.9L9.8 2h4.4l.8 1.6c.6.2 1.1.5 1.6.9l2.2-.3l1.7 2.9L19.4 9c.1.7.1 1.3 0 2Z" />
    </IconBase>
  );
}

function AttachIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconBase>
  );
}

function ArrowUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m12 18V6" />
      <path d="m7 11l5-5l5 5" />
    </IconBase>
  );
}

function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m6 9l6 6l6-6" />
    </IconBase>
  );
}

function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.4" />
      <path d="M12 19.6V22" />
      <path d="m4.9 4.9l1.7 1.7" />
      <path d="m17.4 17.4l1.7 1.7" />
      <path d="M2 12h2.4" />
      <path d="M19.6 12H22" />
      <path d="m4.9 19.1l1.7-1.7" />
      <path d="m17.4 6.6l1.7-1.7" />
    </IconBase>
  );
}

function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M14.5 3.8a7.5 7.5 0 1 0 5.7 10.8a8.8 8.8 0 1 1-5.7-10.8Z" />
    </IconBase>
  );
}

function MonitorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="5" width="17" height="11.5" rx="2.4" />
      <path d="M9 19h6" />
      <path d="M12 16.5V19" />
    </IconBase>
  );
}

function MinusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M6 12h12" />
    </IconBase>
  );
}

function SquareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </IconBase>
  );
}

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m6 6l12 12" />
      <path d="m18 6l-12 12" />
    </IconBase>
  );
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
  const [isSending, setIsSending] = useState(false);
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
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => detectSystemTheme());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("providers");
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
  const selectedProviderCapabilities = selectedProvider
    ? getProviderCapabilities(selectedProvider.kind)
    : [];
  const providerDraftRequiresApiKey = providerRequiresApiKey(providerDraft.kind);
  const isTauriRuntime = useMemo(() => hasTauriRuntime(), []);
  const documentJobs = useDocumentJobs(isTauriRuntime);
  const resolvedTheme = resolveThemePreference(themePreference, systemTheme);
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
  const shouldShowSettings = settingsOpen || shouldPromptInitialSetup;
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
    setSettingsOpen(true);
    setProviderMenuOpen(false);
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
    if (!shouldShowSettings || shouldPromptInitialSetup) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!settingsPanelRef.current?.contains(event.target as Node)) {
        closeSettings();
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [shouldPromptInitialSetup, shouldShowSettings]);

  useEffect(() => {
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

      if (nextShellState.message) {
        setChatStatus({
          tone:
            nextShellState.globalShortcutRegistered && !nextShellState.usedFallbackShortcut
              ? "success"
              : nextShellState.globalShortcutRegistered
                ? "warning"
                : "error",
          message: nextShellState.message,
        });
      }

      const currentWindow = getCurrentWindow();
      await currentWindow.setSkipTaskbar(nextShellState.globalShortcutRegistered);
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
  }, [isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime) {
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

        if (settingsOpen && !shouldPromptInitialSetup) {
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
  }, [isTauriRuntime, providerMenuOpen, settingsOpen, shellState, shouldPromptInitialSetup]);

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
        setChatStatus({
          tone: "success",
          message: `${selectedProvider.name} is ready.`,
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
    void sendPrompt(entry.prompt, provider);
  }

  async function sendPrompt(promptOverride?: string, providerOverride?: ProviderConfig) {
    if (!isTauriRuntime) {
      setReplyError(localValidationError(BROWSER_PREVIEW_MESSAGE));
      setChatStatus({
        tone: "warning",
        message: BROWSER_PREVIEW_MESSAGE,
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

    setIsSending(true);
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
        setPrompt("");
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
      setIsSending(false);
      if (attachedFiles.length === 0) {
        setCloudContextReviewAccepted(false);
      }
    }
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
      <main className="shell">
        <div className="window-shell">
          <header className="window-header" data-tauri-drag-region>
            <div className="window-title" data-tauri-drag-region>
              <div className="window-title-copy">
                <span className="window-badge">PilotBell</span>
                <div>
                  <h1>Ask once, act fast.</h1>
                  <p>
                    {shellState?.activeShortcut
                      ? `Shortcut: ${shellState.activeShortcut}${shellState.usedFallbackShortcut ? " (fallback)" : ""}`
                      : "Rust-native document workflow"}
                  </p>
                </div>
              </div>
            </div>
            <div className="window-actions">
              <div className="theme-switcher" role="group" aria-label="Theme">
                {THEME_OPTIONS.map((option, index) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        option.value === themePreference ? "theme-option active" : "theme-option"
                      }
                      style={{ ["--theme-index" as string]: String(index) }}
                      onClick={() => persistThemePreference(option.value)}
                      aria-pressed={option.value === themePreference}
                      title={
                        option.value === "system"
                          ? `Follow system theme. Current: ${resolvedTheme}.`
                          : `${option.label} theme`
                      }
                    >
                      <Icon />
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="window-icon-button"
                onClick={() => openSettings("providers")}
                aria-label="Open settings"
              >
                <SettingsIcon />
              </button>
              <button
                type="button"
                className="window-icon-button"
                onClick={() => void getCurrentWindow().minimize()}
                aria-label="Minimize window"
              >
                <MinusIcon />
              </button>
              <button
                type="button"
                className="window-icon-button"
                onClick={() => void getCurrentWindow().toggleMaximize()}
                aria-label="Toggle maximize"
              >
                <SquareIcon />
              </button>
              <button
                type="button"
                className="window-icon-button danger"
                onClick={() => void getCurrentWindow().close()}
                aria-label="Close window"
              >
                <CloseIcon />
              </button>
            </div>
          </header>

          <section className="workspace">
            <div className="chat-surface">
              <SessionHistory
                entries={chatEntries}
                shouldPromptInitialSetup={shouldPromptInitialSetup}
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
                onSubmitPrompt={() => void sendPrompt()}
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
                <div className={`notice notice-${chatStatus.tone}`}>{chatStatus.message}</div>
              ) : null}
              {replyError?.details ? <pre className="detail">{replyError.details}</pre> : null}
            </div>
          </section>
        </div>
      </main>

      {shouldShowSettings ? (
        <div className="settings-overlay">
          <div className="settings-panel" ref={settingsPanelRef}>
            <div className="settings-header">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>{shouldPromptInitialSetup ? "First run setup" : "PilotBell settings"}</h2>
                <p className="helper">
                  {shouldPromptInitialSetup
                    ? "PilotBell detected no proven-ready provider yet. Save and test one provider to move into the compact prompt-only surface."
                    : "Provider and document workflow controls stay here so the main surface can remain focused."}
                </p>
              </div>
              {!shouldPromptInitialSetup ? (
                <button
                  type="button"
                  className="window-icon-button"
                  onClick={closeSettings}
                  aria-label="Close settings"
                >
                  <CloseIcon />
                </button>
              ) : null}
            </div>

            <div className="settings-tabs">
              <button
                type="button"
                className={settingsSection === "providers" ? "settings-tab active" : "settings-tab"}
                onClick={() => setSettingsSection("providers")}
              >
                Providers
              </button>
              <button
                type="button"
                className={settingsSection === "documents" ? "settings-tab active" : "settings-tab"}
                onClick={() => setSettingsSection("documents")}
              >
                Documents
              </button>
              <button
                type="button"
                className={settingsSection === "sources" ? "settings-tab active" : "settings-tab"}
                onClick={() => setSettingsSection("sources")}
              >
                Sources
              </button>
            </div>

            {settingsSection === "providers" ? (
              <div className="settings-section">
                <div className="settings-summary-card">
                  <div>
                    <h3>Provider routing</h3>
                    <p>
                      Hosted and local providers live behind the same prompt surface. Settings only stay open by default until PilotBell sees a ready provider or a successful run.
                    </p>
                  </div>
                  <div className="capability-list" aria-label="Provider capabilities">
                    {getProviderCapabilities(providerDraft.kind).map((capability) => (
                      <span key={capability.label} className="capability" title={capability.detail}>
                        {capability.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="settings-grid">
                  <select
                    value={providerDraft.kind}
                    onChange={(event) => {
                      const kind = event.currentTarget.value as ProviderKind;
                      setProviderDraft({
                        ...providerDraft,
                        kind,
                        endpoint: officialEndpointForProvider(kind),
                        advancedEndpoint: false,
                      });
                    }}
                  >
                    {PROVIDER_KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={providerDraft.name}
                    onChange={(event) =>
                      setProviderDraft({ ...providerDraft, name: event.currentTarget.value })
                    }
                    placeholder="Display name"
                  />
                  <input
                    value={providerDraft.model}
                    onChange={(event) =>
                      setProviderDraft({ ...providerDraft, model: event.currentTarget.value })
                    }
                    placeholder="Model available to your API key"
                  />
                  <select
                    value=""
                    onChange={(event) => {
                      const model = event.currentTarget.value;
                      if (model) {
                        setProviderDraft({ ...providerDraft, model });
                      }
                    }}
                  >
                    <option value="">Model presets...</option>
                    <option value="gpt-4.1-mini">OpenAI: gpt-4.1-mini</option>
                    <option value="gpt-4.1">OpenAI: gpt-4.1</option>
                    <option value="claude-sonnet-4-20250514">Anthropic: Claude Sonnet 4</option>
                    <option value="llama3.2">Ollama: llama3.2</option>
                    <option value="local-llama">llama.cpp: local-llama</option>
                  </select>
                  <input
                    value={providerDraft.endpoint}
                    onChange={(event) =>
                      setProviderDraft({ ...providerDraft, endpoint: event.currentTarget.value })
                    }
                    placeholder="Endpoint URL"
                  />
                  <input
                    type="password"
                    value={providerDraft.apiKey}
                    onChange={(event) =>
                      setProviderDraft({ ...providerDraft, apiKey: event.currentTarget.value })
                    }
                    placeholder={
                      providerDraftRequiresApiKey
                        ? editingProvider
                          ? "New API key (optional)"
                          : "API key"
                        : "API key not required"
                    }
                    disabled={!providerDraftRequiresApiKey}
                  />
                </div>

                <p className="helper">
                  Model availability depends on your provider account. If the provider test fails,
                  choose a model available to your API key.
                </p>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={providerDraft.advancedEndpoint}
                    onChange={(event) =>
                      setProviderDraft({
                        ...providerDraft,
                        advancedEndpoint: event.currentTarget.checked,
                      })
                    }
                  />
                  Advanced endpoint mode
                </label>
                <div className={`notice notice-${providerEndpointRisk.tone}`}>
                  {providerEndpointRisk.message}
                </div>

                <div className="settings-actions">
                  <button
                    type="button"
                    className="button-preset"
                    onClick={applyOpenAIPreset}
                    disabled={isProviderActionsDisabled}
                  >
                    Use OpenAI preset
                  </button>
                  <button
                    type="button"
                    className="button-preset"
                    onClick={applyAnthropicPreset}
                    disabled={isProviderActionsDisabled}
                  >
                    Use Anthropic preset
                  </button>
                  <button
                    type="button"
                    className="button-preset"
                    onClick={applyOllamaPreset}
                    disabled={isProviderActionsDisabled}
                  >
                    Use Ollama preset
                  </button>
                  <button
                    type="button"
                    className="button-preset"
                    onClick={applyLlamaCppPreset}
                    disabled={isProviderActionsDisabled}
                  >
                    Use llama.cpp preset
                  </button>
                  <button
                    type="button"
                    className="button-save"
                    onClick={() =>
                      editingProvider ? void updateProvider() : void addProvider()
                    }
                    disabled={!isTauriRuntime || isProviderActionsDisabled}
                  >
                    {isSavingProvider
                      ? editingProvider
                        ? "Updating..."
                        : "Saving..."
                      : editingProvider
                        ? "Update provider"
                        : "Save provider"}
                  </button>
                  {editingProvider ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={cancelProviderEdit}
                      disabled={isProviderActionsDisabled}
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>

                {providerStatus ? (
                  <div className={`notice notice-${providerStatus.tone}`}>{providerStatus.message}</div>
                ) : null}

                {providers.length > 0 ? (
                  <ul className="provider-list">
                    {providers.map((provider) => {
                      const health = providerHealthRecords[provider.id];
                      const readiness = health?.readiness ?? "unknown";
                      return (
                        <li key={provider.id}>
                          <button
                            type="button"
                            className={provider.id === selectedProviderId ? "provider active" : "provider"}
                            onClick={() => setSelectedProviderId(provider.id)}
                            disabled={!isTauriRuntime || isProviderActionsDisabled}
                          >
                            <span>
                              {provider.name} / {provider.model || "model not set"} / {providerKindLabel(provider.kind)}
                              {provider.advancedEndpoint ? " / advanced endpoint" : ""}
                            </span>
                            <span className={`readiness readiness-${readiness}`}>
                              {readinessLabel(readiness)}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => beginEditProvider(provider)}
                            disabled={!isTauriRuntime || isProviderActionsDisabled}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => void removeProvider(provider.id)}
                            disabled={!isTauriRuntime || isProviderActionsDisabled}
                          >
                            {removingProviderId === provider.id ? "Removing..." : "Remove"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="empty">
                    {!isTauriRuntime
                      ? "Open PilotBell through Tauri to save and test providers."
                      : isMigratingProviders
                        ? "Migrating saved providers into the OS credential store..."
                        : "Save a provider, select it, then test the API."}
                  </p>
                )}

                {selectedProvider ? (
                  <div className="provider-health-card">
                    <div className="section-heading">
                      <div className="section-title">Selected provider readiness</div>
                      <span className="status">{selectedProvider.name}</span>
                    </div>
                    <div className="capability-list">
                      {selectedProviderCapabilities.map((capability) => (
                        <span key={capability.label} className="capability" title={capability.detail}>
                          {capability.label}
                        </span>
                      ))}
                    </div>
                    {selectedProviderHealth ? (
                      <div className="health-detail">
                        <span className={`readiness readiness-${selectedProviderHealth.readiness}`}>
                          {readinessLabel(selectedProviderHealth.readiness)}
                        </span>
                        <span>{selectedProviderHealth.message}</span>
                        <span className="status">
                          Checked {formatRelativeTime(selectedProviderHealth.checkedAt)}
                          {selectedProviderHealth.latencyMs
                            ? ` / ${selectedProviderHealth.latencyMs} ms`
                            : ""}
                          {selectedProviderHealth.errorKind
                            ? ` / ${selectedProviderHealth.errorKind}`
                            : ""}
                          {selectedProviderHealth.statusCode
                            ? ` / HTTP ${selectedProviderHealth.statusCode}`
                            : ""}
                          {selectedProviderHealth.retryable ? " / retryable" : ""}
                        </span>
                      </div>
                    ) : (
                      <p className="empty">Run Test API to record readiness for this provider.</p>
                    )}
                    <div className="settings-actions">
                      <button
                        type="button"
                        className="button-test"
                        onClick={() => void testProvider()}
                        disabled={
                          !isTauriRuntime ||
                          isProviderActionsDisabled ||
                          isTestingProvider ||
                          !selectedProvider
                        }
                      >
                        {isTestingProvider ? "Testing..." : "Test API"}
                      </button>
                      {providerRequiresApiKey(selectedProvider.kind) ? (
                        <>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => void diagnoseSelectedProviderSecret()}
                            disabled={!isTauriRuntime || isProviderActionsDisabled}
                          >
                            Diagnose secret
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => beginEditProvider(selectedProvider)}
                            disabled={!isTauriRuntime || isProviderActionsDisabled}
                          >
                            Re-save secret
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => void repairSelectedProviderSecretMetadata()}
                            disabled={!isTauriRuntime || isProviderActionsDisabled}
                          >
                            Repair provider
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => void deleteSelectedProviderSecretOnly()}
                            disabled={!isTauriRuntime || isProviderActionsDisabled}
                          >
                            Delete secret
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
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
                  {localSources.length} deprecated local source registration(s). Persistent index
                  snapshots are cleared on startup.
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
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default App;
