import type { PromptSessionEntry } from "../lib/sessionStore";

type SessionHistoryProps = {
  entries: PromptSessionEntry[];
  shouldPromptInitialSetup: boolean;
  isSending: boolean;
  isTauriRuntime: boolean;
  formatSessionTime: (value: string) => string;
  onRetry: (entry: PromptSessionEntry) => void;
  onCopy: (text: string, label: string) => void;
};

export function SessionHistory({
  entries,
  shouldPromptInitialSetup,
  isSending,
  isTauriRuntime,
  formatSessionTime,
  onRetry,
  onCopy,
}: SessionHistoryProps) {
  if (entries.length === 0) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-copy">
          <p className="eyebrow">Prompt-first desktop workflow</p>
          <h2>
            {shouldPromptInitialSetup
              ? "Set up a provider to start."
              : "Ask something and keep moving."}
          </h2>
          <p>
            {shouldPromptInitialSetup
              ? "PilotBell will open settings until it sees a ready provider or a successful local/hosted run."
              : "Settings stay hidden once a provider has been proven ready, so the surface can stay focused on the next prompt."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-thread">
      {entries.map((entry) => (
        <div key={entry.id} className="chat-turn">
          <div className="bubble-row bubble-user">
            <div className="chat-bubble user-bubble">
              <p>{entry.prompt}</p>
            </div>
          </div>
          <div className="bubble-meta user-meta">
            {formatSessionTime(entry.createdAt)} / {entry.providerName} / {entry.model}
          </div>
          <div className="bubble-row bubble-assistant">
            <div
              className={
                entry.error ? "chat-bubble assistant-bubble error-bubble" : "chat-bubble assistant-bubble"
              }
            >
              <pre>{entry.response ?? entry.error ?? ""}</pre>
            </div>
          </div>
          <div className="bubble-actions">
            <button
              type="button"
              className="ghost-action"
              onClick={() => onRetry(entry)}
              disabled={isSending || !isTauriRuntime}
            >
              Retry
            </button>
            <button
              type="button"
              className="ghost-action"
              onClick={() => onCopy(entry.response ?? entry.error ?? entry.prompt, "Message")}
            >
              Copy
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
