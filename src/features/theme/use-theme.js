import { useEffect, useState } from "react";
import { loadStoredTheme, themeStorageKey } from "@/features/app/storage";

export function useTheme() {
  const [theme, setTheme] = useState(() => loadStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState("light");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = theme === "system" ? (mediaQuery.matches ? "dark" : "light") : theme;
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

  return {
    resolvedTheme,
    setTheme,
    theme,
  };
}
