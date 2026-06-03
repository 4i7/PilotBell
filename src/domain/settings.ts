export type SettingsSection = "providers" | "documents" | "sources";

export function isSettingsSection(value: unknown): value is SettingsSection {
  return value === "providers" || value === "documents" || value === "sources";
}

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

export function getInitialSettingsSection(): SettingsSection {
  const section = getSettingsWindowParams().get("section");
  return isSettingsSection(section) ? section : "providers";
}

export function isSettingsWindowView() {
  return getSettingsWindowParams().get("view") === "settings";
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
