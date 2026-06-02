import { useEffect, useState } from "react";

import {
  type ResolvedTheme,
  type ThemePreference,
  loadThemePreference,
  resolveThemePreference,
  saveThemePreference,
} from "../lib/themeStore";

function detectSystemTheme(): ResolvedTheme {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

export function useThemePreference() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    loadThemePreference(),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => detectSystemTheme());
  const resolvedTheme = resolveThemePreference(themePreference, systemTheme);

  function persistThemePreference(next: ThemePreference) {
    setThemePreference(next);
    saveThemePreference(next);
  }

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    updateTheme();
    mediaQuery.addEventListener("change", updateTheme);

    return () => {
      mediaQuery.removeEventListener("change", updateTheme);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = themePreference;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, themePreference]);

  return {
    themePreference,
    resolvedTheme,
    persistThemePreference,
  };
}
