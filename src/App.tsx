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

function App() {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [providerHealth, setProviderHealth] = useState("");

  const [providers, setProviders] = useState<ProviderConfig[]>(() => loadProviders());
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>({
    name: "",
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "",
    model: "gpt-4.1-mini",
  });

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  function persistProviders(next: ProviderConfig[]) {
    setProviders(next);
    saveProviders(next);
  }

  function addProvider() {
    const normalized = normalizeProviderDraft(providerDraft);
    if (!isProviderDraftValid(normalized)) {
      setError("Provider registration failed: all fields are required.");
      return;
    }

    const nextProvider: ProviderConfig = { id: makeProviderId(), ...normalized };
    const next = [...providers, nextProvider];
    persistProviders(next);
    setSelectedProviderId(nextProvider.id);
    setProviderDraft({ ...providerDraft, apiKey: "" });
    setError("");
  }

  function removeProvider(id: string) {
    const next = providers.filter((provider) => provider.id !== id);
    persistProviders(next);
    if (selectedProviderId === id) setSelectedProviderId("");
  }

  async function testProvider() {
    if (!selectedProvider) {
      setError("Select a provider before testing.");
      return;
    }

    setIsTestingProvider(true);
    setError("");
    setProviderHealth("");

    try {
      const result = await invoke<string>("test_provider", {
        provider: selectedProvider,
      });
      setProviderHealth(result);
    } catch (err) {
      setProviderHealth("");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsTestingProvider(false);
    }
  }

  async function sendPrompt() {
    if (!selectedProvider) {
      setError("Select a provider before sending.");
      return;
    }

    setIsSending(true);
    setError("");
    try {
      const result = await invoke<AssistantReply>("handle_prompt", {
        prompt,
        provider: selectedProvider,
      });
      setReply(result);
    } catch (err) {
      setReply(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar"><div><p className="eyebrow">AI Command Palette</p><h1>PilotBell</h1></div><span className="phase">Build Start</span></header>
      <section className="composer">
        <div className="section-title">Provider settings (open registration)</div>
        <p className="helper">この画面から誰でも API を登録できます。次フェーズで権限管理/鍵保護を追加予定。</p>
        <div className="grid">
          <input value={providerDraft.name} onChange={(event) => setProviderDraft({ ...providerDraft, name: event.currentTarget.value })} placeholder="Display name" />
          <input value={providerDraft.model} onChange={(event) => setProviderDraft({ ...providerDraft, model: event.currentTarget.value })} placeholder="Model (e.g. gpt-4.1-mini)" />
          <input value={providerDraft.endpoint} onChange={(event) => setProviderDraft({ ...providerDraft, endpoint: event.currentTarget.value })} placeholder="Endpoint URL" />
          <input type="password" value={providerDraft.apiKey} onChange={(event) => setProviderDraft({ ...providerDraft, apiKey: event.currentTarget.value })} placeholder="API key" />
        </div>
        <div className="actions">
          <button type="button" onClick={addProvider}>Register API</button>
          <button type="button" onClick={testProvider} disabled={isTestingProvider || !selectedProvider}>{isTestingProvider ? "Testing..." : "Test API"}</button>
          <span className="status">{providers.length} provider(s) saved locally</span>
        </div>
        {providerHealth ? <p className="helper">{providerHealth}</p> : null}
        {providers.length > 0 ? <ul className="provider-list">{providers.map((provider) => <li key={provider.id}><button type="button" className={provider.id === selectedProviderId ? "provider active" : "provider"} onClick={() => setSelectedProviderId(provider.id)}>{provider.name} / {provider.model}</button><button type="button" className="danger" onClick={() => removeProvider(provider.id)}>Remove</button></li>)}</ul> : null}
      </section>
      <form className="composer" onSubmit={(event) => { event.preventDefault(); sendPrompt(); }}>
        <label htmlFor="prompt">Prompt</label>
        <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} placeholder="Ask PilotBell..." rows={6} />
        <div className="actions"><span className="status">{selectedProvider ? `${selectedProvider.name} / ${selectedProvider.model}` : "Select provider"}</span><button type="submit" disabled={isSending}>{isSending ? "Sending..." : "Send"}</button></div>
      </form>
      <section className="response" aria-live="polite"><div className="section-title">Response</div>{error ? <pre className="error">{error}</pre> : reply ? <pre>{reply.content}</pre> : <p className="empty">Waiting for a prompt.</p>}</section>
    </main>
  );
}

export default App;
