// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { getInitialSettingsSection, isSettingsWindowView } from "./settings";

function setLocation(url: string) {
  window.history.replaceState({}, "", url);
}

describe("settings window URL parsing", () => {
  it("recognizes hash-based settings window URLs used by Tauri secondary windows", () => {
    setLocation("/#view=settings&section=sources");

    expect(isSettingsWindowView()).toBe(true);
    expect(getInitialSettingsSection()).toBe("sources");
  });

  it("keeps supporting query-string settings URLs for browser previews and older builds", () => {
    setLocation("/?view=settings&section=documents");

    expect(isSettingsWindowView()).toBe(true);
    expect(getInitialSettingsSection()).toBe("documents");
  });

  it("falls back to providers when the requested section is invalid", () => {
    setLocation("/#view=settings&section=invalid");

    expect(getInitialSettingsSection()).toBe("providers");
  });
});
