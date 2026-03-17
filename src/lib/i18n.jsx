import { createContext, useContext, useEffect, useMemo, useState } from "react";
import zh from "@/locales/zh";

const localeStorageKey = "command-center-locale";
const supportedLocales = ["zh", "zh-hk", "en", "ja", "ko", "fr", "es", "pt", "de", "ms", "ta"];
const intlLocaleMap = {
  zh: "zh-CN",
  "zh-hk": "zh-HK",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
  fr: "fr-FR",
  es: "es-ES",
  pt: "pt-BR",
  de: "de-DE",
  ms: "ms-MY",
  ta: "ta-IN",
};
const localeOptionLabels = {
  zh: "中文",
  "zh-hk": "繁體中文（香港）",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
  ms: "Bahasa Melayu",
  ta: "தமிழ்",
};
const localeOptions = supportedLocales.map((locale) => ({
  value: locale,
  label: localeOptionLabels[locale] || locale,
}));
const dictionaryCache = {
  zh,
};
const localeLoaders = {
  zh: async () => zh,
  "zh-hk": () => import("@/locales/zh-hk").then((module) => module.default || module),
  en: () => import("@/locales/en").then((module) => module.default || module),
  ja: () => import("@/locales/ja").then((module) => module.default || module),
  ko: () => import("@/locales/ko").then((module) => module.default || module),
  fr: () => import("@/locales/fr").then((module) => module.default || module),
  es: () => import("@/locales/es").then((module) => module.default || module),
  pt: () => import("@/locales/pt").then((module) => module.default || module),
  de: () => import("@/locales/de").then((module) => module.default || module),
  ms: () => import("@/locales/ms").then((module) => module.default || module),
  ta: () => import("@/locales/ta").then((module) => module.default || module),
};

function normalizeLocale(rawLocale = "") {
  const normalized = String(rawLocale || "").toLowerCase();
  if (
    normalized.startsWith("zh-hk")
    || normalized.startsWith("zh-mo")
    || normalized.startsWith("zh-tw")
    || normalized.startsWith("zh-hant")
  ) return "zh-hk";
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("pt")) return "pt";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("ms")) return "ms";
  if (normalized.startsWith("ta")) return "ta";
  if (normalized.startsWith("en")) return "en";
  return null;
}

function detectSystemLocale() {
  if (typeof navigator === "undefined") {
    return "zh";
  }

  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  return candidates.map(normalizeLocale).find(Boolean) || "zh";
}

function loadStoredLocale() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(localeStorageKey);
    return supportedLocales.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function loadLocaleDictionary(locale) {
  const normalizedLocale = supportedLocales.includes(locale) ? locale : "zh";

  if (dictionaryCache[normalizedLocale]) {
    return dictionaryCache[normalizedLocale];
  }

  const loader = localeLoaders[normalizedLocale] || localeLoaders.zh;
  const dictionary = await loader();
  dictionaryCache[normalizedLocale] = dictionary;
  return dictionary;
}

const I18nContext = createContext({
  locale: "zh",
  setLocale: () => {},
  localeOptions,
  messages: zh,
  intlLocale: "zh-CN",
});

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => loadStoredLocale() || detectSystemLocale());
  const [messages, setMessages] = useState(() => dictionaryCache[loadStoredLocale() || detectSystemLocale()] || zh);

  useEffect(() => {
    try {
      window.localStorage.setItem(localeStorageKey, locale);
    } catch {}
  }, [locale]);

  useEffect(() => {
    let cancelled = false;

    if (typeof document !== "undefined") {
      document.documentElement.lang = intlLocaleMap[locale] || "zh-CN";
    }

    setMessages(dictionaryCache[locale] || zh);

    void loadLocaleDictionary(locale).then((dictionary) => {
      if (cancelled) {
        return;
      }

      setMessages(dictionary);

      if (typeof document !== "undefined") {
        document.title = dictionary?.app?.documentTitle || dictionary?.app?.title || document.title;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      localeOptions,
      messages,
      intlLocale: intlLocaleMap[locale] || "zh-CN",
    }),
    [locale, messages],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export { localeStorageKey, supportedLocales };
