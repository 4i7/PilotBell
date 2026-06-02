export type SettingsSection = "providers" | "documents" | "sources";

export function isSettingsSection(value: unknown): value is SettingsSection {
  return value === "providers" || value === "documents" || value === "sources";
}

export function getInitialSettingsSection(): SettingsSection {
  if (typeof window === "undefined") {
    return "providers";
  }

  const section = new URLSearchParams(window.location.search).get("section");
  return isSettingsSection(section) ? section : "providers";
}

export function isSettingsWindowView() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("view") === "settings";
}

export function hasTauriRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    "undefined"
  );
}
