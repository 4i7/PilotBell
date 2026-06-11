// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionHistory } from "./SessionHistory";

describe("SessionHistory accessibility", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.scrollTo ??= () => undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("makes the conversation history focusable with log semantics", () => {
    act(() => {
      root.render(
        <SessionHistory
          entries={[
            {
              id: "entry-1",
              prompt: "Summarize this file.",
              response: "Summary text",
              createdAt: "2026-06-10T12:00:00.000Z",
              providerId: "provider-1",
              providerName: "OpenAI",
              model: "gpt-5",
            },
          ]}
          isSending={false}
          isTauriRuntime
          formatSessionTime={() => "12:00"}
          onRetry={vi.fn()}
          onCopy={vi.fn()}
        />,
      );
    });

    const history = container.querySelector(".chat-thread");
    expect(history).not.toBeNull();
    expect(history?.getAttribute("tabindex")).toBe("0");
    expect(history?.getAttribute("role")).toBe("log");
    expect(history?.getAttribute("aria-label")).toBe("Conversation history");
    expect(history?.getAttribute("aria-live")).toBe("polite");
  });
});
