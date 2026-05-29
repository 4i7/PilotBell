import type { PromptSessionEntry } from "../lib/sessionStore";

type SessionHistoryProps = {
  entries: PromptSessionEntry[];
  isSending: boolean;
  isTauriRuntime: boolean;
  formatSessionTime: (value: string) => string;
  onRetry: (entry: PromptSessionEntry) => void;
  onCopy: (text: string, label: string) => void;
};

export function SessionHistory({
  entries,
  isSending,
  isTauriRuntime,
  formatSessionTime,
  onRetry,
  onCopy,
}: SessionHistoryProps) {
  if (entries.length === 0) {
    return null;
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
                entry.error
                  ? "chat-bubble assistant-bubble error-bubble"
                  : "chat-bubble assistant-bubble"
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
