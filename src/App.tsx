import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  DEFAULT_PROVIDER_KIND,
  type ProviderConfig,
  type ProviderDraft,
  type ProviderKind,
  isProviderDraftValid,
  makeProviderId,
  normalizeProviderDraft,
} from "./domain/provider";
import { loadProviderState, saveProviders } from "./lib/providerStore";
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

const PROVIDER_KIND_OPTIONS: Array<{ value: ProviderKind; label: string }> = [
  { value: DEFAULT_PROVIDER_KIND, label: "OpenAI Responses" },
];

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

function App() {
  const [initialProviderState] = useState(() => loadProviderState());
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [replyError, setReplyError] = useState<ProviderCommandError | null>(null);
  const [shellState, setShellState] = useState<AppShellState | null>(null);
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
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>({
    kind: DEFAULT_PROVIDER_KIND,
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "",
    model: "gpt-5.4-mini",
  });

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  function persistProviders(next: ProviderConfig[]) {
    setProviders(next);
    saveProviders(next);
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
  }, []);

  useEffect(() => {
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
  }, [shellState]);

  useEffect(() => {
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
  }, [initialProviderState.legacyProviders]);

  function applyOpenAIPreset() {
    setProviderDraft((current) => ({
      ...current,
      kind: DEFAULT_PROVIDER_KIND,
      name: current.name.trim() || "OpenAI",
      endpoint: "https://api.openai.com/v1/responses",
      model: current.model.trim() || "gpt-5.4-mini",
    }));
  }

  async function addProvider() {
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
      setProviderDraft({
        ...normalized,
        apiKey: "",
      });
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

  async function removeProvider(id: string) {
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
      if (selectedProviderId === id) {
        setSelectedProviderId("");
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
      const result = await invoke<CommandResult<ProviderHealth>>("test_provider", {
        provider: selectedProvider,
      });
      if (result.status === "success") {
        setProviderStatus({
          tone: "success",
          message: result.data.message,
        });
      } else {
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

  async function sendPrompt() {
    if (!selectedProvider) {
      setReplyError(localValidationError("Select a provider before sending."));
      return;
    }
    if (!prompt.trim()) {
      setReplyError(localValidationError("Prompt is empty."));
      return;
    }

    setIsSending(true);
    setReplyError(null);

    try {
      const result = await invoke<CommandResult<AssistantReply>>("handle_prompt", {
        prompt,
        provider: selectedProvider,
      });
      if (result.status === "success") {
        setReply(result.data);
        setReplyError(null);
        setProviderStatus({
          tone: "success",
          message: `Last response came from ${result.data.provider} / ${result.data.model}.`,
        });
      } else {
        setReply(null);
        setReplyError(result.error);
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
        <span className="phase">Phase 2 Foundation</span>
      </header>

      <section className="composer">
        <div className="section-title">Provider settings</div>
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
            placeholder="API key"
          />
        </div>
        <div className="actions">
          <button type="button" onClick={applyOpenAIPreset} disabled={isProviderActionsDisabled}>
            Use OpenAI preset
          </button>
          <button type="button" onClick={() => void addProvider()} disabled={isProviderActionsDisabled}>
            {isSavingProvider ? "Saving..." : "Save provider"}
          </button>
          <button
            type="button"
            onClick={() => void testProvider()}
            disabled={isProviderActionsDisabled || isTestingProvider || !selectedProvider}
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
            {providers.map((provider) => (
              <li key={provider.id}>
                <button
                  type="button"
                  className={provider.id === selectedProviderId ? "provider active" : "provider"}
                  onClick={() => setSelectedProviderId(provider.id)}
                  disabled={isProviderActionsDisabled}
                >
                  {provider.name} / {provider.model} / {providerKindLabel(provider.kind)}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void removeProvider(provider.id)}
                  disabled={isProviderActionsDisabled}
                >
                  {removingProviderId === provider.id ? "Removing..." : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            {isMigratingProviders
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
              isMigratingProviders ||
              !selectedProvider ||
              !prompt.trim()
            }
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>

      <section className="response" aria-live="polite">
        <div className="section-title">Response</div>
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
    </main>
  );
}

export default App;
