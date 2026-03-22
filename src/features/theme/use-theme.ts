import { useEffect, useState } from "react";
import { loadStoredTheme, themeStorageKey } from "@/features/app/storage";

type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

function normalizeThemePreference(value: unknown): ThemePreference {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (normalizedValue === "dark" || normalizedValue === "light" || normalizedValue === "system") {
    return normalizedValue;
  }
  return "system";
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemePreference>(() => normalizeThemePreference(loadStoredTheme()));
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved: ResolvedTheme = theme === "system" ? (mediaQuery.matches ? "dark" : "light") : theme;
      document.documentElement.classList.toggle("dark", resolved === "dark");
      document.documentElement.dataset.theme = resolved;
      setResolvedTheme(resolved);
    };

    applyTheme();
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {}

    const handleChange = () => {
      if (theme === "system") {
        applyTheme();
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const setThemePreference = (nextTheme: string) => {
    setTheme(normalizeThemePreference(nextTheme));
  };

  return {
    resolvedTheme,
    setTheme: setThemePreference,
    theme,
  };
}
