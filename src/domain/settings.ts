import { getCurrentWindow } from "@tauri-apps/api/window";

export type SettingsSection = "providers" | "documents" | "sources";

export function isSettingsSection(value: unknown): value is SettingsSection {
  return value === "providers" || value === "documents" || value === "sources";
}

type SettingsWindowGlobals = Window & {
  __PILOTBELL_SETTINGS_WINDOW__?: boolean;
  __PILOTBELL_SETTINGS_SECTION__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

function getSettingsWindowParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  const queryParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);

  return new URLSearchParams([...queryParams, ...hashParams]);
}

function getCurrentTauriWindowLabel() {
  if (!hasTauriRuntime()) {
    return null;
  }

  try {
    return getCurrentWindow().label;
  } catch {
    return null;
  }
}

export function getInitialSettingsSection(): SettingsSection {
  if (typeof window !== "undefined") {
    const section = (window as SettingsWindowGlobals).__PILOTBELL_SETTINGS_SECTION__;
    if (isSettingsSection(section)) {
      return section;
    }
  }

  const section = getSettingsWindowParams().get("section");
  return isSettingsSection(section) ? section : "providers";
}

export function isSettingsWindowView() {
  return (
    getSettingsWindowParams().get("view") === "settings" ||
    getCurrentTauriWindowLabel() === "settings" ||
    (typeof window !== "undefined" &&
      (window as SettingsWindowGlobals).__PILOTBELL_SETTINGS_WINDOW__ === true)
  );
}

export function hasTauriRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  return typeof (window as SettingsWindowGlobals).__TAURI_INTERNALS__ !== "undefined";
}
