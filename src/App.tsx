import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  type ProviderConfig,
  type ProviderDraft,
  isProviderDraftValid,
  makeProviderId,
  normalizeProviderDraft,
} from "./domain/provider";
import { loadProviders, saveProviders } from "./lib/providerStore";
import "./App.css";

type AssistantReply = {
  content: string;
  provider: string;
  model: string;
};

type ProviderErrorKind =
  | "validation"
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

function toneForProviderError(error: ProviderCommandError): StatusTone {
  if (error.kind === "validation" || error.kind === "response_format") {
    return "warning";
  }

  return "error";
}

function fallbackCommandError(message: string): ProviderCommandError {
  return {
    kind: "internal",
    message,
    retryable: false,
  };
}

function App() {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [replyError, setReplyError] = useState<ProviderCommandError | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [providerStatus, setProviderStatus] = useState<InlineStatus | null>(null);

  const [providers, setProviders] = useState<ProviderConfig[]>(() => loadProviders());
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>({
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "",
    model: "gpt-5.4-mini",
  });

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  function persistProviders(next: ProviderConfig[]) {
    setProviders(next);
    saveProviders(next);
  }

  function applyOpenAIPreset() {
    setProviderDraft((current) => ({
      ...current,
      name: current.name.trim() || "OpenAI",
      endpoint: "https://api.openai.com/v1/responses",
      model: current.model.trim() || "gpt-5.4-mini",
    }));
  }

  function addProvider() {
    const normalized = normalizeProviderDraft(providerDraft);
    if (!isProviderDraftValid(normalized)) {
      setProviderStatus({
        tone: "warning",
        message: "Provider registration failed: all fields are required.",
      });
      return;
    }

    const nextProvider: ProviderConfig = { id: makeProviderId(), ...normalized };
    const next = [...providers, nextProvider];
    persistProviders(next);
    setSelectedProviderId(nextProvider.id);
    setProviderDraft({
      ...normalized,
      apiKey: "",
    });
    setProviderStatus({
      tone: "success",
      message: `Saved ${nextProvider.name}. Select it and run Test API before sending prompts.`,
    });
  }

  function removeProvider(id: string) {
    const next = providers.filter((provider) => provider.id !== id);
    persistProviders(next);
    if (selectedProviderId === id) {
      setSelectedProviderId("");
      setProviderStatus({
        tone: "neutral",
        message: "Selected provider removed. Save or select another provider.",
      });
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
      setReplyError(fallbackCommandError("Select a provider before sending."));
      return;
    }
    if (!prompt.trim()) {
      setReplyError(fallbackCommandError("Prompt is empty."));
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
        fallbackCommandError(err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI Command Palette</p>
          <h1>PilotBell</h1>
        </div>
        <span className="phase">Provider MVP</span>
      </header>

      <section className="composer">
        <div className="section-title">Provider settings</div>
        <p className="helper">
          OpenAI testing preset: `https://api.openai.com/v1/responses` with a model like
          `gpt-5.4-mini` or any model ID you can access.
        </p>
        <div className="grid">
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
          <button type="button" onClick={applyOpenAIPreset}>
            Use OpenAI preset
          </button>
          <button type="button" onClick={addProvider}>
            Save provider
          </button>
          <button
            type="button"
            onClick={testProvider}
            disabled={isTestingProvider || !selectedProvider}
          >
            {isTestingProvider ? "Testing..." : "Test API"}
          </button>
          <span className="status">{providers.length} provider(s) saved locally</span>
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
                >
                  {provider.name} / {provider.model}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => removeProvider(provider.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Save a provider, select it, then test the API.</p>
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
          <button type="submit" disabled={isSending || !selectedProvider || !prompt.trim()}>
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
