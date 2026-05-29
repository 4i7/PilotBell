export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "pilotbell.theme-preference";

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function loadThemePreference(): ThemePreference {
  const raw = localStorage.getItem(STORAGE_KEY);
  return isThemePreference(raw) ? raw : "system";
}

export function saveThemePreference(theme: ThemePreference) {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function resolveThemePreference(
  preference: ThemePreference,
  systemTheme: ResolvedTheme,
): ResolvedTheme {
  if (preference === "system") {
    return systemTheme;
  }

  return preference;
}
