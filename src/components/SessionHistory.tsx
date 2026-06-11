import { useLayoutEffect, useRef, useState } from "react";
import type { PromptSessionEntry } from "../lib/sessionStore";

const STICK_TO_BOTTOM_THRESHOLD = 80;

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
  const threadRef = useRef<HTMLDivElement | null>(null);
  const isStickingRef = useRef(true);
  const previousEntryCountRef = useRef(entries.length);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const isNearBottom = (el: HTMLDivElement) =>
    el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_THRESHOLD;

  const handleScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    const sticking = isNearBottom(el);
    isStickingRef.current = sticking;
    setShowJumpToLatest(!sticking);
  };

  const scrollToBottom = (behavior: ScrollBehavior) => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useLayoutEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const entryCountChanged = entries.length !== previousEntryCountRef.current;
    previousEntryCountRef.current = entries.length;
    if (!entryCountChanged) return;
    if (isStickingRef.current) {
      scrollToBottom("auto");
      setShowJumpToLatest(false);
    }
  }, [entries]);

  useLayoutEffect(() => {
    scrollToBottom("auto");
  }, []);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="chat-thread-wrap">
      <div
        className="chat-thread"
        ref={threadRef}
        onScroll={handleScroll}
        tabIndex={0}
        role="log"
        aria-label="Conversation history"
        aria-live="polite"
      >
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
      {showJumpToLatest && (
        <button
          type="button"
          className="jump-to-latest"
          onClick={() => {
            isStickingRef.current = true;
            setShowJumpToLatest(false);
            scrollToBottom("smooth");
          }}
        >
          ↓ Latest
        </button>
      )}
    </div>
  );
}
