// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadPromptSession, savePromptSession, type PromptSessionEntry } from "./sessionStore";

function entry(id: number): PromptSessionEntry {
  return {
    id: `entry-${id}`,
    prompt: `Prompt ${id}`,
    createdAt: "2026-06-11T12:00:00.000Z",
    providerId: "provider-1",
    providerName: "OpenAI",
    model: "gpt-5",
    response: `Response ${id}`,
  };
}

describe("savePromptSession quota handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("persists fewer entries instead of throwing when the quota is exceeded", () => {
    const entries = Array.from({ length: 8 }, (_, i) => entry(i));
    const realSetItem = Storage.prototype.setItem;
    let failures = 2;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (failures > 0) {
        failures -= 1;
        throw new DOMException("quota", "QuotaExceededError");
      }
      realSetItem.call(this, key, value);
    });

    expect(() => savePromptSession(entries)).not.toThrow();
    // 8 -> 4 -> 2 entries survive after two simulated quota failures.
    expect(loadPromptSession()).toHaveLength(2);
  });

  it("clears the stored session when nothing fits", () => {
    savePromptSession([entry(1)]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() => savePromptSession([entry(2)])).not.toThrow();

    vi.restoreAllMocks();
    expect(loadPromptSession()).toEqual([]);
  });
});
