import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  DEFAULT_PROVIDER_KIND,
  type ProviderConfig,
  type ProviderDraft,
  type ProviderKind,
  getProviderCapabilities,
  isProviderDraftValid,
  makeProviderId,
  normalizeProviderDraft,
} from "./domain/provider";
import { loadProviderState, saveProviders } from "./lib/providerStore";
import {
  type PromptSessionEntry,
  loadPromptSession,
  savePromptSession,
} from "./lib/sessionStore";
import {
  type ProviderHealthRecord,
  type ProviderReadiness,
  loadProviderHealthRecords,
  saveProviderHealthRecords,
} from "./lib/providerHealthStore";
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

const FOCUS_PROMPT_EVENT = "pilotbell://focus-prompt";
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

const PROVIDER_KIND_OPTIONS: Array<{ value: ProviderKind; label: string }> = [
  { value: DEFAULT_PROVIDER_KIND, label: "OpenAI Responses" },
];

const DEFAULT_PROVIDER_DRAFT: ProviderDraft = {
  kind: DEFAULT_PROVIDER_KIND,
  name: "OpenAI",
  endpoint: "https://api.openai.com/v1/responses",
  apiKey: "",
  model: "gpt-5.4-mini",
};

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

function App() {
  const [initialProviderState] = useState(() => loadProviderState());
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);
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

  const [providers, setProviders] = useState<ProviderConfig[]>(initialProviderState.providers);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [editingProviderId, setEditingProviderId] = useState("");
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>({ ...DEFAULT_PROVIDER_DRAFT });

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );
  const editingProvider = useMemo(
    () => providers.find((provider) => provider.id === editingProviderId) ?? null,
    [providers, editingProviderId],
  );
  const latestSessionEntry = sessionEntries[0] ?? null;
  const selectedProviderHealth = selectedProvider
    ? providerHealthRecords[selectedProvider.id] ?? null
    : null;
  const selectedProviderCapabilities = selectedProvider
    ? getProviderCapabilities(selectedProvider.kind)
    : [];
  const isTauriRuntime = useMemo(() => hasTauriRuntime(), []);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  function persistProviders(next: ProviderConfig[]) {
    setProviders(next);
    saveProviders(next);
  }

  function persistSessionEntries(next: PromptSessionEntry[]) {
    setSessionEntries(next);
    savePromptSession(next);
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

  async function hidePaletteWindow() {
    return invoke("hide_palette_window");
  }

  useEffect(() => {
    if (!isTauriRuntime) {
      setProviderStatus({
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
        setProviderStatus({
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
  }, [isTauriRuntime, shellState]);

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
      kind: DEFAULT_PROVIDER_KIND,
      name: current.name.trim() || "OpenAI",
      endpoint: "https://api.openai.com/v1/responses",
      model: current.model.trim() || "gpt-5.4-mini",
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
    });
    setProviderStatus({
      tone: "neutral",
      message: `Editing ${provider.name}. Leave API key blank to keep the stored secret.`,
    });
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
    if (!isProviderDraftValid(normalized)) {
      setProviderStatus({
        tone: "warning",
        message: "Provider registration failed: all fields are required.",
      });
      return;
    }

    const nextProvider: ProviderConfig = {
      id: makeProviderId(),
      kind: normalized.kind,
      name: normalized.name,
      endpoint: normalized.endpoint,
      model: normalized.model,
      hasSecret: true,
    };

    setIsSavingProvider(true);
    setProviderStatus({
      tone: "neutral",
      message: `Saving ${nextProvider.name} into the OS credential store...`,
    });

    try {
      const secretResult = await storeProviderSecret(nextProvider.id, normalized.apiKey);
      if (secretResult.status === "error") {
        setProviderStatus({
          tone: toneForProviderError(secretResult.error),
          message: secretResult.error.message,
        });
        return;
      }

      const next = [...providers, nextProvider];
      persistProviders(next);
      setSelectedProviderId(nextProvider.id);
      setProviderDraft({ ...DEFAULT_PROVIDER_DRAFT });
      setProviderStatus({
        tone: "success",
        message: `Saved ${nextProvider.name}. Metadata stays in PilotBell, and the API key now lives in the OS credential store.`,
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
    if (!isProviderDraftValid(normalized, { requireApiKey: false })) {
      setProviderStatus({
        tone: "warning",
        message: "Provider update failed: type, name, endpoint, and model are required.",
      });
      return;
    }

    if (!editingProvider.hasSecret && !normalized.apiKey) {
      setProviderStatus({
        tone: "warning",
        message: "Provider update failed: API key is required because no stored secret exists.",
      });
      return;
    }

    const nextProvider: ProviderConfig = {
      id: editingProvider.id,
      kind: normalized.kind,
      name: normalized.name,
      endpoint: normalized.endpoint,
      model: normalized.model,
      hasSecret: editingProvider.hasSecret || Boolean(normalized.apiKey),
    };

    setIsSavingProvider(true);
    setProviderStatus({
      tone: "neutral",
      message: `Updating ${nextProvider.name}...`,
    });

    try {
      if (normalized.apiKey) {
        const secretResult = await storeProviderSecret(nextProvider.id, normalized.apiKey);
        if (secretResult.status === "error") {
          setProviderStatus({
            tone: toneForProviderError(secretResult.error),
            message: secretResult.error.message,
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
        message: normalized.apiKey
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
      setProviderStatus({
        tone: "success",
        message: `${label} copied to clipboard.`,
      });
    } catch (err) {
      setProviderStatus({
        tone: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function clearSession() {
    persistSessionEntries([]);
    setReply(null);
    setReplyError(null);
    setProviderStatus({
      tone: "neutral",
      message: "Prompt session cleared.",
    });
  }

  function retrySessionEntry(entry: PromptSessionEntry) {
    const provider = providers.find((candidate) => candidate.id === entry.providerId);
    if (!provider) {
      setProviderStatus({
        tone: "warning",
        message: "The provider used for that prompt is no longer available.",
      });
      setPrompt(entry.prompt);
      return;
    }

    setSelectedProviderId(provider.id);
    void sendPrompt(entry.prompt, provider);
  }

  async function sendPrompt(promptOverride?: string, providerOverride?: ProviderConfig) {
    if (!isTauriRuntime) {
      setReplyError(localValidationError(BROWSER_PREVIEW_MESSAGE));
      return;
    }

    const targetPrompt = promptOverride ?? prompt;
    const targetProvider = providerOverride ?? selectedProvider;

    if (!targetProvider) {
      setReplyError(localValidationError("Select a provider before sending."));
      return;
    }
    if (!targetPrompt.trim()) {
      setReplyError(localValidationError("Prompt is empty."));
      return;
    }

    setIsSending(true);
    setReplyError(null);
    setPrompt(targetPrompt);

    try {
      const result = await invoke<CommandResult<AssistantReply>>("handle_prompt", {
        prompt: targetPrompt,
        provider: targetProvider,
      });
      if (result.status === "success") {
        setReply(result.data);
        setReplyError(null);
        addSessionEntry({
          id: makeSessionEntryId(),
          prompt: targetPrompt,
          createdAt: new Date().toISOString(),
          providerId: targetProvider.id,
          providerName: result.data.provider,
          model: result.data.model,
          response: result.data.content,
        });
        setProviderStatus({
          tone: "success",
          message: `Last response came from ${result.data.provider} / ${result.data.model}.`,
        });
      } else {
        setReply(null);
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
        setProviderStatus({
          tone: toneForProviderError(result.error),
          message: result.error.retryable
            ? "Provider request failed. Retry is available after you adjust settings or credentials."
            : "Provider request failed. Review the provider status details before retrying.",
        });
      }
    } catch (err) {
      setReply(null);
      setReplyError(
        localValidationError(err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setIsSending(false);
    }
  }

  const isProviderActionsDisabled =
    isMigratingProviders || isSavingProvider || removingProviderId.length > 0;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI Command Palette</p>
          <h1>PilotBell</h1>
          {shellState ? (
            <p className="helper shortcut-line">
              Shortcut: {shellState.activeShortcut}
              {shellState.usedFallbackShortcut ? " (fallback)" : ""}
            </p>
          ) : null}
        </div>
        <span className="phase">Phase 3 Providers</span>
      </header>

      <section className="composer">
        <div className="section-heading">
          <div className="section-title">Provider settings</div>
          <span className="status">
            {editingProvider ? `Editing ${editingProvider.name}` : "New provider"}
          </span>
        </div>
        <p className="helper">
          Provider metadata stays in PilotBell storage. API keys are saved separately in the
          OS credential store through Rust/Tauri. The adapter path is now keyed by provider
          type, starting with {providerKindLabel(DEFAULT_PROVIDER_KIND)}.
        </p>
        <div className="grid">
          <select
            value={providerDraft.kind}
            onChange={(event) =>
              setProviderDraft({
                ...providerDraft,
                kind: event.currentTarget.value as ProviderKind,
              })
            }
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
            placeholder="Model (e.g. gpt-5.4-mini)"
          />
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
            placeholder={editingProvider ? "New API key (optional)" : "API key"}
          />
        </div>
        <div className="capability-list" aria-label="Provider capabilities">
          {getProviderCapabilities(providerDraft.kind).map((capability) => (
            <span key={capability.label} className="capability" title={capability.detail}>
              {capability.label}
            </span>
          ))}
        </div>
        <div className="actions">
          <button type="button" onClick={applyOpenAIPreset} disabled={isProviderActionsDisabled}>
            Use OpenAI preset
          </button>
          <button
            type="button"
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
          <button
            type="button"
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
          <span className="status">{providers.length} provider metadata record(s) saved locally</span>
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
                      {provider.name} / {provider.model} / {providerKindLabel(provider.kind)}
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
      </section>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void sendPrompt();
        }}
      >
        <label htmlFor="prompt">Prompt</label>
        <textarea
          id="prompt"
          ref={promptRef}
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          placeholder="Ask PilotBell..."
          rows={6}
        />
        <div className="actions">
          <span className="status">
            {selectedProvider
              ? `${selectedProvider.name} / ${selectedProvider.model}`
              : "Select provider"}
          </span>
          <button
            type="submit"
            disabled={
              isSending ||
              !isTauriRuntime ||
              isMigratingProviders ||
              !selectedProvider ||
              !prompt.trim()
            }
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>

      <section className="health-panel">
        <div className="section-heading">
          <div className="section-title">Provider readiness and capabilities</div>
          <span className="status">
            {selectedProvider ? selectedProvider.name : "No provider selected"}
          </span>
        </div>
        {selectedProvider ? (
          <div className="health-stack">
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
          </div>
        ) : (
          <p className="empty">Select a provider to inspect readiness.</p>
        )}
      </section>

      <section className="response" aria-live="polite">
        <div className="section-heading">
          <div className="section-title">Response</div>
          <div className="inline-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (latestSessionEntry) {
                  retrySessionEntry(latestSessionEntry);
                }
              }}
              disabled={isSending || !latestSessionEntry || !isTauriRuntime}
            >
              Retry last
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (reply) {
                  void copyText(reply.content, "Response");
                }
              }}
              disabled={!reply}
            >
              Copy response
            </button>
            <button
              type="button"
              className="secondary"
              onClick={clearSession}
              disabled={sessionEntries.length === 0 && !reply && !replyError}
            >
              Clear session
            </button>
          </div>
        </div>
        {replyError ? (
          <div className="response-stack">
            <pre className="error">{replyError.message}</pre>
            {replyError.details ? <pre className="detail">{replyError.details}</pre> : null}
            <p className="helper">
              Error kind: {replyError.kind}
              {replyError.statusCode ? ` / HTTP ${replyError.statusCode}` : ""}
              {replyError.retryable ? " / retryable" : ""}
            </p>
          </div>
        ) : reply ? (
          <pre>{reply.content}</pre>
        ) : (
          <p className="empty">Waiting for a prompt.</p>
        )}
      </section>

      <section className="history">
        <div className="section-heading">
          <div className="section-title">Prompt history</div>
          <span className="status">{sessionEntries.length} recent item(s)</span>
        </div>
        {sessionEntries.length > 0 ? (
          <ol className="history-list">
            {sessionEntries.map((entry) => (
              <li key={entry.id} className="history-item">
                <div className="history-main">
                  <div className="history-meta">
                    {formatSessionTime(entry.createdAt)} / {entry.providerName} / {entry.model}
                  </div>
                  <p className="history-prompt">{entry.prompt}</p>
                  {entry.response ? (
                    <p className="history-preview">{entry.response}</p>
                  ) : entry.error ? (
                    <p className="history-error">{entry.error}</p>
                  ) : null}
                </div>
                <div className="history-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => retrySessionEntry(entry)}
                    disabled={isSending || !isTauriRuntime}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      void copyText(entry.response ?? entry.error ?? entry.prompt, "History item")
                    }
                  >
                    Copy
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">Recent prompts will appear here after the first response.</p>
        )}
      </section>
    </main>
  );
}

export default App;
