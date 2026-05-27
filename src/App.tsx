import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

  async function sendPrompt() {
    setIsSending(true);
    setError("");

    try {
      const result = await invoke<AssistantReply>("handle_prompt", { prompt });
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
      <header className="topbar">
        <div>
          <p className="eyebrow">AI Command Palette</p>
          <h1>PilotBell</h1>
        </div>
        <span className="phase">Phase 1</span>
      </header>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          sendPrompt();
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
            {reply ? `${reply.provider} / ${reply.model}` : "Ready"}
          </span>
          <button type="submit" disabled={isSending}>
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>

      <section className="response" aria-live="polite">
        <div className="section-title">Response</div>
        {error ? (
          <pre className="error">{error}</pre>
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
