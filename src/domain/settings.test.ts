// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { getInitialSettingsSection, isSettingsWindowView } from "./settings";

function setLocation(url: string) {
  window.history.replaceState({}, "", url);
}

function clearSettingsWindowGlobals() {
  delete (window as Window & { __PILOTBELL_SETTINGS_WINDOW__?: boolean })
    .__PILOTBELL_SETTINGS_WINDOW__;
  delete (window as Window & { __PILOTBELL_SETTINGS_SECTION__?: string })
    .__PILOTBELL_SETTINGS_SECTION__;
}

describe("settings window URL parsing", () => {
  it("recognizes Tauri initialization globals used by packaged secondary windows", () => {
    clearSettingsWindowGlobals();
    setLocation("/");
    (window as Window & { __PILOTBELL_SETTINGS_WINDOW__?: boolean })
      .__PILOTBELL_SETTINGS_WINDOW__ = true;
    (window as Window & { __PILOTBELL_SETTINGS_SECTION__?: string })
      .__PILOTBELL_SETTINGS_SECTION__ = "sources";

    expect(isSettingsWindowView()).toBe(true);
    expect(getInitialSettingsSection()).toBe("sources");

    clearSettingsWindowGlobals();
  });

  it("recognizes query-string settings URLs used by Tauri secondary windows", () => {
    clearSettingsWindowGlobals();
    setLocation("/?view=settings&section=sources");

    expect(isSettingsWindowView()).toBe(true);
    expect(getInitialSettingsSection()).toBe("sources");
  });

  it("keeps supporting hash-based settings URLs for browser previews and older builds", () => {
    clearSettingsWindowGlobals();
    setLocation("/#view=settings&section=documents");

    expect(isSettingsWindowView()).toBe(true);
    expect(getInitialSettingsSection()).toBe("documents");
  });

  it("falls back to providers when the requested section is invalid", () => {
    clearSettingsWindowGlobals();
    setLocation("/#view=settings&section=invalid");

    expect(getInitialSettingsSection()).toBe("providers");
  });
});
